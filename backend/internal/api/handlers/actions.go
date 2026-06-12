package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yashwanta/AMRDashboard/internal/models"
	amrssh "github.com/yashwanta/AMRDashboard/internal/ssh"
)

type ActionHandler struct {
	db                  *pgxpool.Pool
	encryptionKey       string
	allowCustomCommands bool
}

type actionRunRequest struct {
	ServerID    int    `json:"server_id"`
	Action      string `json:"action"`
	ServiceName string `json:"service_name,omitempty"`
	PackageName string `json:"package_name,omitempty"`
	Command     string `json:"command,omitempty"`
}

type actionRunResponse struct {
	ID        int64     `json:"id"`
	ServerID  int       `json:"server_id"`
	Action    string    `json:"action"`
	Command   string    `json:"command"`
	Status    string    `json:"status"`
	Output    string    `json:"output"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func NewActionHandler(db *pgxpool.Pool, key string, allowCustomCommands bool) *ActionHandler {
	return &ActionHandler{db: db, encryptionKey: key, allowCustomCommands: allowCustomCommands}
}

func (h *ActionHandler) Run(w http.ResponseWriter, r *http.Request) {
	var req actionRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.ServerID == 0 {
		jsonError(w, "server is required", http.StatusBadRequest)
		return
	}

	command, err := h.buildCommand(req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	server, err := h.serverWithCredentials(r.Context(), req.ServerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			jsonError(w, "server not found", http.StatusNotFound)
			return
		}
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	audit := auditCommand(command, req)
	run, saveErr := h.saveRun(r.Context(), req, audit, "running", "Queued. Connecting over SSH...", "", createdBy(r))
	if saveErr != nil {
		jsonError(w, saveErr.Error(), http.StatusInternalServerError)
		return
	}

	go h.executeRun(context.Background(), run.ID, server, command)

	jsonOK(w, run)
}

func (h *ActionHandler) executeRun(ctx context.Context, runID int64, server models.ServerRequest, command string) {
	client, err := amrssh.Connect(amrssh.Config{
		Host:       server.Host,
		Port:       server.Port,
		Username:   server.Username,
		AuthType:   server.AuthType,
		Password:   server.Password,
		PrivateKey: server.PrivateKey,
	})
	if err != nil {
		_ = h.updateRun(ctx, runID, "failed", "", err.Error())
		return
	}
	defer client.Close()

	output, runErr := client.Run(command)
	status := "success"
	errText := ""
	if runErr != nil {
		status = "failed"
		errText = runErr.Error()
	}

	_ = h.updateRun(ctx, runID, status, output, errText)
}

func (h *ActionHandler) History(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, server_id, action, command, status, output, error, created_at
		FROM action_runs
		ORDER BY created_at DESC
		LIMIT 50`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	runs := []actionRunResponse{}
	for rows.Next() {
		var run actionRunResponse
		if err := rows.Scan(&run.ID, &run.ServerID, &run.Action, &run.Command, &run.Status, &run.Output, &run.Error, &run.CreatedAt); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		runs = append(runs, run)
	}
	jsonOK(w, runs)
}

func (h *ActionHandler) buildCommand(req actionRunRequest) (string, error) {
	action := strings.TrimSpace(req.Action)
	service := strings.TrimSpace(req.ServiceName)
	switch action {
	case "service_status", "service_restart", "service_start", "service_stop", "service_enable", "service_disable":
		if !validUnitName(service) {
			return "", fmt.Errorf("valid service name is required")
		}
		verb := strings.TrimPrefix(action, "service_")
		command := fmt.Sprintf("systemctl %s %s", verb, shellQuote(service))
		if action == "service_status" {
			return command, nil
		}
		return rootRequiredCommand(command), nil
	case "package_update_cache":
		return packageManagerCommand(
			rootRequiredScript(aptLockCheckScript()+"\napt-get update"),
			rootRequiredCommand("dnf -y makecache"),
			rootRequiredCommand("yum -y makecache"),
		), nil
	case "package_list_upgrades":
		return packageManagerCommand("apt list --upgradable 2>/dev/null || true", "dnf check-update || true", "yum check-update || true"), nil
	case "package_upgrade_dry_run":
		return packageManagerCommand("apt-get -s upgrade", "dnf -y --assumeno upgrade", "yum -y --assumeno update"), nil
	case "package_upgrade":
		return packageManagerCommand(
			rootRequiredScript(aptLockCheckScript()+"\nDEBIAN_FRONTEND=noninteractive apt-get -y upgrade"),
			rootRequiredCommand("dnf -y upgrade"),
			rootRequiredCommand("yum -y update"),
		), nil
	case "package_install":
		pkg := strings.TrimSpace(req.PackageName)
		if !validPackageName(pkg) {
			return "", fmt.Errorf("valid package name is required")
		}
		return packageManagerCommand(
			rootRequiredScript(aptLockCheckScript()+"\nDEBIAN_FRONTEND=noninteractive apt-get install -y "+shellQuote(pkg)),
			rootRequiredCommand("dnf install -y "+shellQuote(pkg)),
			rootRequiredCommand("yum install -y "+shellQuote(pkg)),
		), nil
	case "remediate_cve_2026_31431_linux_signed":
		return cve202631431Command(), nil
	case "remediate_cve_2026_43494_linux_signed_upgrade":
		return cve202643494Command(), nil
	case "remediate_cve_2026_43494_ubuntu_generic_kernel":
		return cve202643494GenericKernelCommand(), nil
	case "system_reboot":
		return rootRequiredCommand("sh -c 'nohup systemctl reboot >/dev/null 2>&1 &'"), nil
	case "approved_custom_command":
		command := strings.TrimSpace(req.Command)
		if command == "" {
			return "", fmt.Errorf("command is required")
		}
		return approvedCustomCommand(command)
	case "custom_command":
		if !h.allowCustomCommands {
			return "", fmt.Errorf("custom commands are disabled on this server")
		}
		command := strings.TrimSpace(req.Command)
		if command == "" {
			return "", fmt.Errorf("command is required")
		}
		return command, nil
	default:
		return "", fmt.Errorf("unknown action")
	}
}

func (h *ActionHandler) serverWithCredentials(ctx context.Context, id int) (models.ServerRequest, error) {
	var server models.ServerRequest
	var passwordEnc, privateKeyEnc string
	err := h.db.QueryRow(ctx, `
		SELECT host, port, username, auth_type, COALESCE(password_enc,''), COALESCE(private_key_enc,'')
		FROM servers WHERE id=$1`, id).
		Scan(&server.Host, &server.Port, &server.Username, &server.AuthType, &passwordEnc, &privateKeyEnc)
	if err != nil {
		return server, err
	}
	if passwordEnc != "" {
		password, err := decrypt(h.encryptionKey, passwordEnc)
		if err != nil {
			return server, fmt.Errorf("decrypt server password: %w", err)
		}
		server.Password = password
	}
	if privateKeyEnc != "" {
		privateKey, err := decrypt(h.encryptionKey, privateKeyEnc)
		if err != nil {
			return server, fmt.Errorf("decrypt server private key: %w", err)
		}
		server.PrivateKey = privateKey
	}
	return server, nil
}

func (h *ActionHandler) saveRun(ctx context.Context, req actionRunRequest, command, status, output, errText, createdBy string) (actionRunResponse, error) {
	var run actionRunResponse
	err := h.db.QueryRow(ctx, `
		INSERT INTO action_runs (server_id, action, command, status, output, error, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, server_id, action, command, status, output, error, created_at`,
		req.ServerID, req.Action, command, status, output, errText, createdBy).
		Scan(&run.ID, &run.ServerID, &run.Action, &run.Command, &run.Status, &run.Output, &run.Error, &run.CreatedAt)
	return run, err
}

func (h *ActionHandler) updateRun(ctx context.Context, id int64, status, output, errText string) error {
	_, err := h.db.Exec(ctx, `
		UPDATE action_runs
		SET status=$2, output=$3, error=$4
		WHERE id=$1`,
		id, status, output, errText)
	return err
}

func createdBy(r *http.Request) string {
	username, _ := usernameFromRequest(r)
	return username
}

var unitNameRE = regexp.MustCompile(`^[A-Za-z0-9_.@:-]+$`)
var linuxNameRE = regexp.MustCompile(`^[a-z_][a-z0-9_-]{0,31}$`)
var packageNameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:+-]{0,127}$`)
var approvedCommandTokenRE = regexp.MustCompile(`^[A-Za-z0-9_./:=@%+,-]+$`)

func validUnitName(value string) bool {
	return value != "" && unitNameRE.MatchString(value)
}

func validLinuxName(value string) bool {
	return linuxNameRE.MatchString(value)
}

func validPackageName(value string) bool {
	return value != "" && packageNameRE.MatchString(value)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func auditCommand(command string, req actionRunRequest) string {
	return command
}

func rootRequiredScript(body string) string {
	script := "if [ \"$(id -u)\" -ne 0 ]; then echo \"Run this script with sudo or as root\"; exit 1; fi\n" + body
	quoted := shellQuote(script)
	return "if [ \"$(id -u)\" -eq 0 ]; then sh -c " + quoted + "; else sudo -n sh -c " + quoted + "; fi"
}

func rootRequiredCommand(command string) string {
	return rootRequiredScript(command)
}

func aptLockCheckScript() string {
	return `if command -v fuser >/dev/null 2>&1; then
  for lock in /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock; do
    if [ -e "$lock" ] && fuser "$lock" >/dev/null 2>&1; then
      echo "APT/dpkg lock is active: $lock"
      exit 3
    fi
  done
fi`
}

func aptKernelRemediationScript(cve string) string {
	return fmt.Sprintf(`set -eu
echo "%s Ubuntu apt kernel remediation started."
%s
echo "Updating apt package cache..."
DEBIAN_FRONTEND=noninteractive apt-get update
packages=""
for pkg in linux-generic linux-image-generic linux-headers-generic linux-generic-hwe-24.04 linux-image-generic-hwe-24.04 linux-headers-generic-hwe-24.04; do
  if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
    packages="$packages $pkg"
  fi
done
if [ -z "$(echo "$packages" | xargs)" ]; then
  image_packages="$(dpkg-query -W -f='${Package}\n' 'linux-image-[0-9]*' 2>/dev/null | sort -u || true)"
  if [ -n "$image_packages" ]; then
    packages="$image_packages"
  fi
fi
packages="$(echo "$packages" | xargs || true)"
if [ -z "$packages" ]; then
  echo "No supported installed Ubuntu kernel meta/image package found to upgrade."
  echo "Installed kernel-related packages:"
  dpkg-query -W -f='${Package} ${Version}\n' 'linux-generic*' 'linux-image*' 'linux-headers*' 2>/dev/null | sort || true
  echo "Running kernel:"
  uname -r
  exit 2
fi
echo "Upgrading detected kernel packages: $packages"
if ! DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade $packages; then
  echo "Kernel package upgrade failed."
  exit 4
fi
echo "Installed kernel packages after remediation:"
dpkg-query -W -f='${Package} ${Version}\n' 'linux-generic*' 'linux-image*' 'linux-headers*' 2>/dev/null | sort || true
echo "Running kernel:"
uname -r
if [ -f /var/run/reboot-required ]; then
  echo "Reboot required: yes"
  if [ -f /var/run/reboot-required.pkgs ]; then
    echo "Packages requiring reboot:"
    cat /var/run/reboot-required.pkgs
  fi
else
  echo "Reboot required: no"
fi
echo "Package upgrade completed. Review reboot status before declaring %s remediated."`, cve, aptLockCheckScript(), cve)
}

func kernelRemediationCommand(cve string) string {
	return packageManagerCommand(
		rootRequiredScript(aptKernelRemediationScript(cve)),
		"echo '"+cve+" remediation is currently defined for Ubuntu/Debian apt systems. dnf detected; no action taken.'; exit 2",
		"echo '"+cve+" remediation is currently defined for Ubuntu/Debian apt systems. yum detected; no action taken.'; exit 2",
	)
}

func cve202631431Command() string {
	return kernelRemediationCommand("CVE-2026-31431")
}

func cve202643494Command() string {
	return kernelRemediationCommand("CVE-2026-43494")
}

func cve202643494GenericKernelCommand() string {
	return kernelRemediationCommand("CVE-2026-43494")
}

func approvedCustomCommand(command string) (string, error) {
	if strings.ContainsAny(command, "|;`$<>") {
		return "", fmt.Errorf("approved custom commands cannot contain pipes, semicolons, shell expansion, or redirects")
	}
	parts := strings.Split(command, "&&")
	if len(parts) > 4 {
		return "", fmt.Errorf("approved custom commands can include up to 4 commands joined with &&")
	}
	var out []string
	for _, part := range parts {
		part = strings.TrimSpace(part)
		part = strings.TrimPrefix(part, "sudo ")
		if part == "" {
			return "", fmt.Errorf("empty command segment")
		}
		if !approvedCommandPrefix(part) {
			return "", fmt.Errorf("command is not in the approved custom command allowlist")
		}
		for _, token := range strings.Fields(part) {
			if !approvedCommandTokenRE.MatchString(token) {
				return "", fmt.Errorf("unsupported command token: %s", token)
			}
		}
		if commandNeedsSudo(part) {
			out = append(out, rootRequiredCommand(part))
		} else {
			out = append(out, part)
		}
	}
	return strings.Join(out, " && "), nil
}

func approvedCommandPrefix(command string) bool {
	prefixes := []string{
		"apt-get update",
		"apt-get install",
		"apt-get install -y --only-upgrade",
		"apt-get -y install",
		"apt-get upgrade",
		"apt-get -y upgrade",
		"apt list",
		"DEBIAN_FRONTEND=noninteractive apt-get install",
		"env DEBIAN_FRONTEND=noninteractive apt-get install",
		"dnf makecache",
		"dnf install",
		"dnf upgrade",
		"yum makecache",
		"yum install",
		"yum update",
		"systemctl status",
		"systemctl restart",
		"systemctl start",
		"systemctl stop",
		"systemctl enable",
		"systemctl disable",
		"journalctl",
		"df ",
		"free",
		"uptime",
		"uname",
	}
	for _, prefix := range prefixes {
		if command == strings.TrimSpace(prefix) || strings.HasPrefix(command, prefix+" ") {
			return true
		}
	}
	return false
}

func commandNeedsSudo(command string) bool {
	for _, prefix := range []string{"apt-get", "DEBIAN_FRONTEND=noninteractive apt-get", "env DEBIAN_FRONTEND=noninteractive apt-get", "dnf", "yum", "systemctl restart", "systemctl start", "systemctl stop", "systemctl enable", "systemctl disable"} {
		if strings.HasPrefix(command, prefix) {
			return true
		}
	}
	return false
}

func packageManagerCommand(apt, dnf, yum string) string {
	return fmt.Sprintf("if command -v apt-get >/dev/null 2>&1; then %s; elif command -v dnf >/dev/null 2>&1; then %s; elif command -v yum >/dev/null 2>&1; then %s; else echo 'No supported package manager found. Supported: apt, dnf, yum.'; exit 2; fi", apt, dnf, yum)
}
