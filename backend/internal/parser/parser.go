package parser

import (
	"strings"
	"time"

	"github.com/yashwanta/AMRDashboard/internal/models"
)

type rule struct {
	keywords  []string
	eventType string
	severity  string
}

var rules = []rule{
	// Robot connectivity.
	{[]string{"UnconnectedState"}, "robot_offline", "high"},
	{[]string{"ClosingState"}, "robot_offline", "medium"},
	{[]string{"remote host closed the connection"}, "robot_offline", "high"},
	{[]string{"Connect timeout"}, "robot_offline", "high"},
	{[]string{"Add device failed"}, "robot_offline", "high"},
	{[]string{"Not connected"}, "robot_offline", "medium"},
	{[]string{"slotTcpError", "setLastError"}, "robot_offline", "medium"},
	{[]string{"ConnectedState"}, "robot_online", "info"},

	// Ubuntu server shutdown / reboot.
	{[]string{"systemd-shutdown", "Reached target System Power Off", "Reached target Power-Off", "Power Down", "System is going down"}, "ubuntu_server_shutdown", "high"},
	{[]string{"systemd-logind: System is powering down", "systemd[1]: Powering Off", "Stopped target Multi-User System"}, "ubuntu_server_shutdown", "high"},
	{[]string{"systemd-logind: System is rebooting", "Reached target Reboot", "Rebooting", "reboot: Restarting system"}, "ubuntu_server_reboot", "high"},
	{[]string{"systemd[1]: Rebooting", "Starting Reboot", "Stopped target Graphical Interface"}, "ubuntu_server_reboot", "medium"},

	// Proxmox host shutdown / reboot.
	{[]string{"host is going down", "host shutdown", "node shutdown", "pve host shutdown"}, "proxmox_host_shutdown", "high"},
	{[]string{"host reboot", "node reboot", "pve host reboot", "proxmox ve reboot"}, "proxmox_host_reboot", "high"},
	{[]string{"proxmox ve reboot", "proxmox-ve reboot", "pve-manager reboot"}, "proxmox_host_reboot", "medium"},

	// VM shutdown / reboot events as reported by QEMU/libvirt/Proxmox.
	{[]string{"qm shutdown", "guest-shutdown", "vm shutdown", "qemu: terminating on signal", "acpi shutdown"}, "vm_stopped", "medium"},
	{[]string{"qm stop", "stopping vm", "vm stopped", "status: stopped", "stop vm"}, "vm_stopped", "high"},
	{[]string{"qm start", "starting vm", "vm started", "status: running", "start vm"}, "vm_started", "info"},
	{[]string{"qm reboot", "guest reboot", "vm reboot", "resetting vm", "system_reset"}, "vm_reboot", "medium"},
	{[]string{"killed process", "kill process", "oom-kill", "out of memory: kill process"}, "vm_killed_by_oom", "critical"},

	// Proxmox memory / backup / HA.
	{[]string{"out of memory", "oom killer", "oom_kill_process", "memory allocation failure"}, "host_memory_exhaustion", "critical"},
	{[]string{"swap full", "swap is full", "no swap space", "swap usage 100"}, "swap_full", "critical"},
	{[]string{"backup found vm stopped", "not running - VM is stopped", "vm is stopped", "guest is not running"}, "backup_found_vm_stopped", "high"},
	{[]string{"vzdump", "backup job", "proxmox backup", "pbs", "backup started", "backup finished"}, "backup_job", "medium"},
	{[]string{"ha-manager", "pve-ha-crm", "pve-ha-lrm", "service migrated", "fence", "recovering service"}, "ha_action", "high"},

	// Power and network events.
	{[]string{"AC power", "UPS", "on battery", "power lost", "power restored", "Power button pressed"}, "power_network_event", "high"},
	{[]string{"dhcp failed", "no dhcpoffers", "network unreachable", "temporary failure in name resolution"}, "network_dhcp_failure", "high"},
	{[]string{"NETDEV WATCHDOG", "transmit timeout", "link is down", "Link is Down", "link becomes ready", "carrier lost"}, "network_dhcp_failure", "medium"},

	// Crashes & kernel panics.
	{[]string{"kernel panic", "Kernel panic"}, "crash", "critical"},
	{[]string{"BUG:", "OOPS:", "oops:"}, "crash", "critical"},
	{[]string{"Out of memory", "oom_kill_process", "OOM killer", "oom-killer"}, "crash", "critical"},
	{[]string{"segfault", "segmentation fault"}, "crash", "high"},
	{[]string{"Call Trace:", "Call trace:"}, "crash", "high"},
	{[]string{"general protection fault"}, "crash", "critical"},
	{[]string{"RIP:", "RSP:"}, "crash", "high"},
	{[]string{"Oops:"}, "crash", "critical"},
	{[]string{"watchdog: BUG: soft lockup"}, "crash", "critical"},
	{[]string{"core dumped", "Aborted (core"}, "crash", "high"},

	// Disk / filesystem errors.
	{[]string{"I/O error", "EXT4-fs error", "XFS (", "BTRFS error"}, "disk_error", "high"},
	{[]string{"Buffer I/O error", "end_request"}, "disk_error", "high"},
	{[]string{"filesystem error", "disk error"}, "disk_error", "high"},
	{[]string{"SCSI error", "No space left"}, "disk_error", "high"},
	{[]string{"smart overall-health", "SMART Health Status", "zpool status", "read error", "write error"}, "disk_smart_issue", "high"},

	// Service failures.
	{[]string{"Failed to start", "failed with result", "Service entered failed state"}, "error", "high"},
	{[]string{"systemd[1]: Failed"}, "error", "high"},
	{[]string{"startup_robod", "RoboShopPro", "rdscore"}, "error", "medium"},
	{[]string{"failed unit", "service failed", "main process exited", "unit entered failed state"}, "service_failure", "high"},

	// Ubuntu log gaps / auth activity.
	{[]string{"journal begins", "logs begin at", "rotated", "time jump", "clock jump"}, "ubuntu_log_gap", "medium"},
	{[]string{"sshd", "accepted password", "accepted publickey", "failed password", "session opened", "sudo:"}, "ssh_login_activity", "low"},

	// Hardware errors.
	{[]string{"MCE", "Machine check events logged", "hardware error"}, "error", "critical"},
	{[]string{"EDAC", "corrected memory error", "uncorrected memory error"}, "error", "high"},
	{[]string{"NMI:"}, "error", "critical"},

	// AMR / Roboshop application errors.
	{[]string{"[Fatal]", "[FATAL]"}, "error", "critical"},
	{[]string{"[Error]", "[ERROR]", "exception", "Exception"}, "error", "high"},
	{[]string{"scene load failed", "smap load failed", "robot.cp"}, "error", "high"},
	{[]string{"addr2line"}, "crash", "high"},

	// Update / dependency warnings.
	{[]string{"update available", "Update available", "apt-get upgrade", "needs update"}, "update", "low"},
	{[]string{"security update", "Security update"}, "update", "medium"},

	// General errors / warnings.
	{[]string{" error ", " ERROR ", "Error:", "error:"}, "error", "medium"},
	{[]string{" warning ", " WARNING ", "Warning:"}, "warning", "low"},
	{[]string{"critical", "CRITICAL"}, "error", "high"},
}

var rebootSkipSources = map[string]bool{
	"system_info": true,
}

var shutdownRebootTypes = map[string]bool{
	"ubuntu_server_shutdown": true,
	"ubuntu_server_reboot":   true,
	"proxmox_host_shutdown":  true,
	"proxmox_host_reboot":    true,
	"vm_stopped":             true,
	"vm_reboot":              true,
}

func ParseLine(line, source string, serverID int) *models.LogEvent {
	if strings.TrimSpace(line) == "" {
		return nil
	}

	if strings.HasPrefix(strings.TrimSpace(line), "reboot") &&
		strings.Contains(line, "system boot") {
		return nil
	}

	if strings.Contains(line, "Failed to make thread") && strings.Contains(line, "realtime scheduled") {
		return nil
	}
	if strings.Contains(line, "RealtimeKit1") {
		return nil
	}
	if strings.Contains(line, "Normal Shutdown") || strings.Contains(line, "normal disconnect") {
		return nil
	}
	if strings.Contains(line, "SSL_shutdown") || strings.Contains(line, "CrowdStrike") {
		return nil
	}
	if strings.Contains(line, "TTY=pts") && strings.Contains(line, "COMMAND=") {
		return nil
	}
	if strings.Contains(line, "TTY=tty") && strings.Contains(line, "COMMAND=") {
		return nil
	}
	if strings.Contains(line, "(command continued)") {
		return nil
	}
	if strings.Contains(source, "root_history") && hasAny(strings.ToLower(line), "grep ", "egrep ", "journalctl ", "zgrep ") {
		return nil
	}

	ts := extractTimestamp(line)
	matchLine := strings.ToLower(line)
	if strings.HasPrefix(source, "proxmox") && isProxmoxAccessLog(matchLine) {
		return newEvent(serverID, ts, "ssh_login_activity", "low", line, source)
	}
	if strings.HasPrefix(source, "proxmox") && !strings.Contains(source, "root_history") && hasAny(matchLine, "oom", "out of memory", "killed process", "oom-killer", "oom-kill") {
		if hasAny(matchLine, "qemu", "kvm", "qemu.slice", ".scope", "vm ") {
			return newEvent(serverID, ts, "vm_killed_by_oom", "critical", line, source)
		}
		return newEvent(serverID, ts, "host_memory_exhaustion", "critical", line, source)
	}

	for _, r := range rules {
		if shutdownRebootTypes[r.eventType] && rebootSkipSources[source] {
			continue
		}

		for _, kw := range r.keywords {
			if strings.Contains(matchLine, strings.ToLower(kw)) {
				return newEvent(serverID, ts, r.eventType, r.severity, line, source)
			}
		}
	}

	return newEvent(serverID, ts, "unknown", "low", line, source)
}

func isProxmoxAccessLog(line string) bool {
	return strings.Contains(line, "pveproxy/access.log") ||
		strings.Contains(line, "/api2/json/") ||
		strings.Contains(line, "/api2/extjs/") ||
		strings.Contains(line, "/api2/html/")
}

func hasAny(s string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(s, needle) {
			return true
		}
	}
	return false
}

func newEvent(serverID int, ts time.Time, eventType, severity, line, source string) *models.LogEvent {
	msg := strings.TrimSpace(line)
	if len(msg) > 500 {
		msg = msg[:500]
	}
	return &models.LogEvent{
		ServerID:  serverID,
		Timestamp: ts,
		EventType: eventType,
		Severity:  severity,
		Message:   msg,
		Source:    source,
		RawLine:   line,
	}
}

func ParseOutput(output, source string, serverID int) []models.LogEvent {
	var events []models.LogEvent
	seen := make(map[string]bool)
	unknownCount := 0

	for _, line := range strings.Split(output, "\n") {
		ev := ParseLine(line, source, serverID)
		if ev == nil {
			continue
		}
		if ev.EventType == "unknown" {
			unknownCount++
			if unknownCount > 100 {
				continue
			}
		}
		key := ev.EventType + ev.Message
		if seen[key] {
			continue
		}
		seen[key] = true
		events = append(events, *ev)
	}
	return events
}

var isoFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05.000000-0700",
	"2006-01-02T15:04:05-0700",
	"2006-01-02T15:04:05+0000",
	"2006-01-02 15:04:05",
}

func extractTimestamp(line string) time.Time {
	now := time.Now().UTC()
	parts := strings.Fields(line)
	if len(parts) == 0 {
		return now
	}

	for _, f := range isoFormats {
		if t, err := time.Parse(f, parts[0]); err == nil {
			return t.UTC()
		}
		if len(parts) > 1 {
			if t, err := time.Parse(f, parts[0]+" "+parts[1]); err == nil {
				return t.UTC()
			}
		}
	}

	if len(parts) >= 3 {
		day := parts[1]
		var raw string
		if len(day) == 1 {
			raw = parts[0] + "  " + day + " " + parts[2]
		} else {
			raw = parts[0] + " " + day + " " + parts[2]
		}
		for _, f := range []string{"Jan  2 15:04:05", "Jan 02 15:04:05"} {
			if t, err := time.Parse(f, raw); err == nil {
				t = time.Date(now.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.UTC)
				if t.After(now.Add(24 * time.Hour)) {
					t = t.AddDate(-1, 0, 0)
				}
				return t
			}
		}
	}

	return now
}
