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
	// Crashes & kernel panics
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

	// Power off / reboot
	{[]string{"Power Down", "System is going down", "shutdown", "Shutdown"}, "power_off", "high"},
	{[]string{"reboot", "Rebooting"}, "power_off", "medium"},
	{[]string{"ACPI: Preparing to enter system sleep"}, "power_off", "medium"},
	{[]string{"systemd-logind: System is rebooting"}, "power_off", "high"},

	// Disk / filesystem errors
	{[]string{"I/O error", "EXT4-fs error", "XFS (", "BTRFS error"}, "disk_error", "high"},
	{[]string{"Buffer I/O error", "end_request"}, "disk_error", "high"},
	{[]string{"filesystem error", "disk error"}, "disk_error", "high"},
	{[]string{"SCSI error", "No space left"}, "disk_error", "high"},

	// Service failures
	{[]string{"Failed to start", "failed with result", "Service entered failed state"}, "error", "high"},
	{[]string{"systemd[1]: Failed"}, "error", "high"},
	{[]string{"startup_robod", "RoboShopPro", "rdscore"}, "error", "medium"},

	// Hardware errors
	{[]string{"MCE", "Machine check events logged", "hardware error"}, "error", "critical"},
	{[]string{"EDAC", "corrected memory error", "uncorrected memory error"}, "error", "high"},
	{[]string{"NMI:"}, "error", "critical"},

	// Network errors
	{[]string{"NETDEV WATCHDOG", "transmit timeout"}, "error", "medium"},
	{[]string{"link is down", "Link is Down"}, "error", "medium"},

	// AMR robot: disconnect / offline
	{[]string{"UnconnectedState"}, "robot_offline", "high"},
	{[]string{"ClosingState"}, "robot_offline", "medium"},
	{[]string{"remote host closed the connection"}, "robot_offline", "high"},
	{[]string{"Connect timeout"}, "robot_offline", "high"},
	{[]string{"Add device failed"}, "robot_offline", "high"},
	{[]string{"Not connected"}, "robot_offline", "medium"},
	{[]string{"slotTcpError", "setLastError"}, "robot_offline", "medium"},

	// AMR robot: online / connected
	{[]string{"ConnectedState"}, "robot_online", "info"},

	// AMR / Roboshop application errors
	{[]string{"[Fatal]", "[FATAL]"}, "error", "critical"},
	{[]string{"[Error]", "[ERROR]", "exception", "Exception"}, "error", "high"},
	{[]string{"scene load failed", "smap load failed", "robot.cp"}, "error", "high"},
	{[]string{"addr2line"}, "crash", "high"},

	// Update / dependency warnings
	{[]string{"update available", "Update available", "apt-get upgrade", "needs update"}, "update", "low"},
	{[]string{"security update", "Security update"}, "update", "medium"},

	// General errors / warnings (catch-all, lowest priority)
	{[]string{" error ", " ERROR ", "Error:", "error:"}, "error", "medium"},
	{[]string{" warning ", " WARNING ", "Warning:"}, "warning", "low"},
	{[]string{"critical", "CRITICAL"}, "error", "high"},
}

// ParseLine analyses a single log line and returns a LogEvent if it matches.
func ParseLine(line, source string, serverID int) *models.LogEvent {
	if strings.TrimSpace(line) == "" {
		return nil
	}

	ts := extractTimestamp(line)

	for _, r := range rules {
		for _, kw := range r.keywords {
			if strings.Contains(line, kw) {
				msg := strings.TrimSpace(line)
				if len(msg) > 500 {
					msg = msg[:500]
				}
				return &models.LogEvent{
					ServerID:  serverID,
					Timestamp: ts,
					EventType: r.eventType,
					Severity:  r.severity,
					Message:   msg,
					Source:    source,
					RawLine:   line,
				}
			}
		}
	}
	return nil
}

// ParseOutput parses full log output and returns all matching events.
func ParseOutput(output, source string, serverID int) []models.LogEvent {
	var events []models.LogEvent
	seen := make(map[string]bool)

	for _, line := range strings.Split(output, "\n") {
		ev := ParseLine(line, source, serverID)
		if ev == nil {
			continue
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

// isoFormats covers journald and structured log timestamps (year included).
var isoFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05.000000-0700",
	"2006-01-02T15:04:05+0000",
	"2006-01-02 15:04:05",
}

func extractTimestamp(line string) time.Time {
	now := time.Now().UTC()
	parts := strings.Fields(line)
	if len(parts) == 0 {
		return now
	}

	// ISO / full-date formats (year present).
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

	// Syslog format: "Jun  4 15:04:05 hostname ..."
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
