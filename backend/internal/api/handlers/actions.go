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
	ServerID     int    `json:"server_id"`
	Action       string `json:"action"`
	ServiceName  string `json:"service_name,omitempty"`
	Username     string `json:"username,omitempty"`
	NewPassword  string `json:"new_password,omitempty"`
	PackageName  string `json:"package_name,omitempty"`
	SudoPassword string `json:"sudo_password,omitempty"`
	Command      string `json:"command,omitempty"`
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

	client, err := amrssh.Connect(amrssh.Config{
		Host:       server.Host,
		Port:       server.Port,
		Username:   server.Username,
		AuthType:   server.AuthType,
		Password:   server.Password,
		PrivateKey: server.PrivateKey,
	})
	if err != nil {
		h.saveRun(r.Context(), req, auditCommand(command, req), "failed", "", err.Error(), createdBy(r))
		jsonError(w, err.Error(), http.StatusBadGateway)
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

	run, saveErr := h.saveRun(r.Context(), req, auditCommand(command, req), status, output, errText, createdBy(r))
	if saveErr != nil {
		jsonError(w, saveErr.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, run)
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
		return sudoCommand(req.SudoPassword, command), nil
	case "package_update_cache":
		return packageManagerCommand(
			sudoCommand(req.SudoPassword, "apt-get update"),
			sudoCommand(req.SudoPassword, "dnf -y makecache"),
			sudoCommand(req.SudoPassword, "yum -y makecache"),
		), nil
	case "package_list_upgrades":
		return packageManagerCommand("apt list --upgradable 2>/dev/null || true", "dnf check-update || true", "yum check-update || true"), nil
	case "package_upgrade_dry_run":
		return packageManagerCommand("apt-get -s upgrade", "dnf -y --assumeno upgrade", "yum -y --assumeno update"), nil
	case "package_upgrade":
		return packageManagerCommand(
			sudoCommand(req.SudoPassword, "env DEBIAN_FRONTEND=noninteractive apt-get -y upgrade"),
			sudoCommand(req.SudoPassword, "dnf -y upgrade"),
			sudoCommand(req.SudoPassword, "yum -y update"),
		), nil
	case "package_install":
		pkg := strings.TrimSpace(req.PackageName)
		if !validPackageName(pkg) {
			return "", fmt.Errorf("valid package name is required")
		}
		return packageManagerCommand(
			sudoCommand(req.SudoPassword, "env DEBIAN_FRONTEND=noninteractive apt-get install -y "+shellQuote(pkg)),
			sudoCommand(req.SudoPassword, "dnf install -y "+shellQuote(pkg)),
			sudoCommand(req.SudoPassword, "yum install -y "+shellQuote(pkg)),
		), nil
	case "remediate_cve_2026_31431_linux_signed":
		return cve202631431Command(req.SudoPassword), nil
	case "approved_custom_command":
		command := strings.TrimSpace(req.Command)
		if command == "" {
			return "", fmt.Errorf("command is required")
		}
		return approvedCustomCommand(req.SudoPassword, command)
	case "change_password":
		username := strings.TrimSpace(req.Username)
		if !validLinuxName(username) || req.NewPassword == "" {
			return "", fmt.Errorf("valid username and new password are required")
		}
		pair := username + ":" + req.NewPassword
		return fmt.Sprintf("printf %%s %s | %s", shellQuote(pair), sudoCommand(req.SudoPassword, "chpasswd")), nil
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

func sudoCommand(password, command string) string {
	password = strings.TrimSpace(password)
	if password == "" {
		return "sudo " + command
	}
	return fmt.Sprintf("printf '%%s\\n' %s | sudo -S -p '' %s", shellQuote(password), command)
}

func auditCommand(command string, req actionRunRequest) string {
	if strings.TrimSpace(req.SudoPassword) != "" {
		command = strings.ReplaceAll(command, shellQuote(strings.TrimSpace(req.SudoPassword)), "'******'")
	}
	if req.NewPassword != "" {
		command = strings.ReplaceAll(command, req.NewPassword, "******")
		command = strings.ReplaceAll(command, shellQuote(req.Username+":"+req.NewPassword), "'"+req.Username+":******'")
	}
	return command
}

func cve202631431Command(password string) string {
	return packageManagerCommand(
		sudoCommand(password, "apt-get update")+" && "+sudoCommand(password, "env DEBIAN_FRONTEND=noninteractive apt-get install -y linux-signed"),
		"echo 'CVE-2026-31431 linux-signed remediation is currently defined for Ubuntu/Debian apt systems.'; exit 2",
		"echo 'CVE-2026-31431 linux-signed remediation is currently defined for Ubuntu/Debian apt systems.'; exit 2",
	)
}

func approvedCustomCommand(password, command string) (string, error) {
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
			out = append(out, sudoCommand(password, part))
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
		"apt-get -y install",
		"apt-get upgrade",
		"apt-get -y upgrade",
		"apt list",
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
	for _, prefix := range []string{"apt-get", "dnf", "yum", "systemctl restart", "systemctl start", "systemctl stop", "systemctl enable", "systemctl disable"} {
		if strings.HasPrefix(command, prefix) {
			return true
		}
	}
	return false
}

func packageManagerCommand(apt, dnf, yum string) string {
	return fmt.Sprintf("if command -v apt-get >/dev/null 2>&1; then %s; elif command -v dnf >/dev/null 2>&1; then %s; elif command -v yum >/dev/null 2>&1; then %s; else echo 'No supported package manager found. Supported: apt, dnf, yum.'; exit 2; fi", apt, dnf, yum)
}
