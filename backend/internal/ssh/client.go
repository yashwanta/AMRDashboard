package ssh

import (
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type Client struct {
	conn *ssh.Client
}

type Config struct {
	Host       string
	Port       int
	Username   string
	AuthType   string
	Password   string
	PrivateKey string
}

func Connect(cfg Config) (*Client, error) {
	var auth []ssh.AuthMethod

	switch cfg.AuthType {
	case "key":
		signer, err := ssh.ParsePrivateKey([]byte(cfg.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		auth = append(auth, ssh.PublicKeys(signer))
	default:
		auth = append(auth, ssh.Password(cfg.Password))
	}

	sshCfg := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

func (c *Client) Close() {
	c.conn.Close()
}

func (c *Client) Run(cmd string) (string, error) {
	sess, err := c.conn.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	out, err := sess.CombinedOutput(cmd)
	if err != nil {
		if len(out) > 0 {
			return string(out), nil
		}
		return "", fmt.Errorf("run %q: %w", cmd, err)
	}
	return string(out), nil
}

// FetchLogs pulls Ubuntu and FleetManager/application logs since the given time.
// Covers: AMR/RDS connection state, Roboshop app logs, kernel/OOM/crash,
// disk errors, service failures, MySQL health, live TCP connections.
func (c *Client) FetchLogs(since time.Time, appLogPaths string) (map[string]string, error) {
	sinceStr := since.UTC().Format("2006-01-02 15:04:05")
	startTS := since.UTC().Format("20060102150405")
	nowTS := time.Now().UTC().Format("20060102150405")

	logs := make(map[string]string)

	run := func(key, cmd string) {
		out, err := c.Run(cmd)
		if err == nil && strings.TrimSpace(out) != "" {
			logs[key] = out
		}
	}

	// -- journald: AMR / RDS / Roboshop connection + crash events
	amrGrep := "Roboshop|rds|AMR|10[.]216[.]35|SocketState|ConnectedState|UnconnectedState" +
		"|ClosingState|remote host closed|Connect timeout|Add device failed|Not connected" +
		"|slotTcpError|setLastError|timeout|disconnect|connected|19204|19205|19206|19207"
	run("journald_amr", fmt.Sprintf(
		"journalctl --since %q --no-pager -o short-iso 2>/dev/null | grep -Ei %q || true",
		sinceStr, amrGrep))

	// -- journald -k: kernel OOM / panic / disk / hardware
	kernGrep := "oom|out of memory|killed process|segfault|core dumped|error|fail|panic" +
		"|BUG:|OOPS:|watchdog|soft lockup|I.O error|EXT4|XFS|BTRFS|MCE|NMI|blocked" +
		"|link is down|link is up"
	run("journald_kernel", fmt.Sprintf(
		"journalctl -k --since %q --no-pager -o short-iso 2>/dev/null | grep -Ei %q || true",
		sinceStr, kernGrep))

	// -- startup_robod service
	run("journald_robod", fmt.Sprintf(
		"journalctl -u startup_robod --since %q --no-pager -o short-iso 2>/dev/null || true",
		sinceStr))

	// -- all units: warning and above
	run("journald_warnings", fmt.Sprintf(
		"journalctl --since %q -p warning --no-pager -o short-iso 2>/dev/null || true",
		sinceStr))

	// -- Roboshop app log files (timestamp-range filtered)
	roboshopGrep := "AMR|10[.]216[.]35|SocketState|ConnectedState|UnconnectedState|ClosingState" +
		"|remote host closed|Connect timeout|Add device failed|Not connected|slotTcpError" +
		"|setLastError|timeout|disconnect|connected|19204|19205|19206|19207" +
		"|error|failed|fatal|exception|segfault|scene|smap"
	run("roboshop_app", fmt.Sprintf(
		"find /opt/Roboshop/bin/location/appInfo/log -type f -iname '*.log' -print0 2>/dev/null"+
			" | xargs -0 awk -v start=%s -v end=%s"+
			" '{if (match($0,/\\[([0-9]{8}) ([0-9]{6})\\./,a)){ts=a[1] a[2];if(ts>=start&&ts<=end)print FILENAME\": \"$0}}'"+
			" 2>/dev/null | grep -Ei %q || true",
		startTS, nowTS, roboshopGrep))

	// -- RDS / rdscore / robod file logs
	rdsGrep := "AMR|10[.]216[.]35|SocketState|ConnectedState|UnconnectedState|ClosingState" +
		"|remote host closed|Connect timeout|Add device failed|Not connected|slotTcpError" +
		"|setLastError|timeout|disconnect|connected|19204|19205|19206|19207" +
		"|error|failed|fatal|exception|scene|smap|mysql|database|segfault"
	run("rds_file_logs",
		"find /opt/data/rds /opt/data/rdscore /opt/data/robod -type f"+
			" \\( -iname '*.log' -o -iname '*.out' -o -iname '*.err' \\) -mmin -1440 -print0 2>/dev/null"+
			" | xargs -0 grep -HinEi "+fmt.Sprintf("%q", rdsGrep)+" 2>/dev/null || true")

	if strings.TrimSpace(appLogPaths) != "" {
		for i, path := range strings.Split(appLogPaths, "\n") {
			path = strings.TrimSpace(path)
			if path == "" {
				continue
			}
			run(fmt.Sprintf("app_custom_%d", i+1), fmt.Sprintf(
				"find %q -type f \\( -iname '*.log' -o -iname '*.out' -o -iname '*.err' \\) -mmin -10080 -print0 2>/dev/null"+
					" | xargs -0 grep -HinEi %q 2>/dev/null || true",
				path, roboshopGrep+"|oom|killed|reboot|shutdown|backup|network|disk|ssh|failed|fatal"))
		}
	}

	// -- live AMR TCP connections
	run("live_amr_tcp",
		"ss -tnp 2>/dev/null | grep -Ei '10[.]216[.]35|19204|19205|19206|19207|Roboshop|rds|rbk' || true")

	// -- syslog fallback
	run("syslog", fmt.Sprintf(
		"grep -a '' /var/log/syslog 2>/dev/null | awk -v s=%q '$0>=s' | tail -n 5000 || true",
		sinceStr))

	// -- kern.log
	run("kern.log", "tail -n 5000 /var/log/kern.log 2>/dev/null || true")

	// -- auth.log
	run("auth.log", "tail -n 2000 /var/log/auth.log 2>/dev/null || true")

	// -- system info snapshot
	run("system_info",
		"echo '=uptime='; uptime;"+
			" echo '=df='; df -h;"+
			" echo '=free='; free -h;"+
			" echo '=services_failed='; systemctl list-units --type=service --state=failed 2>/dev/null || true;"+
			" echo '=last_reboot='; last reboot | head -n 5;"+
			" echo '=coredumps='; coredumpctl list 2>/dev/null | tail -n 20 || true")

	// -- MySQL / RDS database health
	run("mysql_health",
		"mysql -e 'SHOW DATABASES;' 2>/dev/null;"+
			" mysql -D rds -e 'SELECT COUNT(*) AS scene_records, MAX(id) AS max_id,"+
			" MAX(create_time) AS last_scene_save FROM t_scene_record;' 2>/dev/null || true")

	return logs, nil
}

// FetchProxmoxLogs pulls host, VM, task, backup, HA, storage, and QEMU context
// from a Proxmox/PVE host. It is intentionally best-effort because not every
// PVE install keeps the same log files or enables HA/backup tooling.
func (c *Client) FetchProxmoxLogs(since time.Time, vmid string) map[string]string {
	sinceStr := since.UTC().Format("2006-01-02 15:04:05")
	logs := make(map[string]string)

	run := func(key, cmd string) {
		out, err := c.Run(cmd)
		if err == nil && strings.TrimSpace(out) != "" {
			logs[key] = out
		}
	}

	pveGrep := "qemu|kvm|qm |vm |VM |oom|out of memory|killed process|memory|swap|backup|vzdump|pbs|ha-manager|pve-ha|shutdown|reboot|stopped|started|task|disk|smart|zfs|network|dhcp|link is down|link is up|failed|error"

	run("proxmox_journal", fmt.Sprintf(
		"journalctl --since %q --no-pager -o short-iso 2>/dev/null | grep -Ei %q || true",
		sinceStr, pveGrep))
	run("proxmox_syslog", fmt.Sprintf(
		"grep -aEi %q /var/log/syslog /var/log/messages 2>/dev/null | tail -n 8000 || true",
		pveGrep))
	run("proxmox_tasks", "find /var/log/pve/tasks -type f -mmin -10080 -print0 2>/dev/null | xargs -0 grep -HinEi 'qm|qemu|vzdump|backup|ha|shutdown|reboot|start|stop|error|failed|OK' 2>/dev/null || true")
	run("proxmox_api_proxy", "grep -aEi 'POST|PUT|DELETE|qm|qemu|vzdump|backup|login|auth|error|failed' /var/log/pveproxy/access.log /var/log/pveproxy/*.log 2>/dev/null | tail -n 4000 || true")
	run("proxmox_ha", "grep -aEi 'ha|lrm|crm|migrate|fence|recover|started|stopped|error|failed' /var/log/pve-ha-* /var/log/syslog 2>/dev/null | tail -n 4000 || true")
	run("proxmox_backup", "grep -aEi 'vzdump|backup|pbs|snapshot|VM is locked|not running|stopped|failed|error|OK' /var/log/vzdump/*.log /var/log/syslog 2>/dev/null | tail -n 5000 || true")
	run("proxmox_host_memory", "echo '=free='; free -h; echo '=swapon='; swapon --show; echo '=top_mem='; ps aux --sort=-%mem | head -n 20; echo '=dmesg_oom='; dmesg -T 2>/dev/null | grep -Ei 'oom|out of memory|killed process|swap|memory allocation failure' | tail -n 100 || true")
	run("proxmox_storage", "echo '=df='; df -h; echo '=zpool='; zpool status 2>/dev/null || true; echo '=smart='; for d in /dev/sd? /dev/nvme?n?; do smartctl -H $d 2>/dev/null; done")

	if strings.TrimSpace(vmid) != "" {
		run("proxmox_vm_status", fmt.Sprintf("echo '=qm_status='; qm status %q 2>/dev/null || true; echo '=qm_config='; qm config %q 2>/dev/null || true", vmid, vmid))
		run("proxmox_qemu", fmt.Sprintf("grep -aEi '(%s|vm %s|VM %s|qemu.%s|kvm.*%s|oom|killed|shutdown|reboot|stopped|started|backup|failed|error)' /var/log/syslog /var/log/pve/tasks/*/* /var/log/vzdump/*.log 2>/dev/null | tail -n 8000 || true", vmid, vmid, vmid, vmid, vmid))
	}

	return logs
}
