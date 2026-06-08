package parser

import "testing"

func TestParseLineLogReviewCategories(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		source    string
		eventType string
		severity  string
	}{
		{
			name:      "robot offline",
			line:      "[9301][Warn][slotTcpError] [Server:10.1.2.3:9301][Tcp:Connect timeout] SocketState:UnconnectedState",
			source:    "journald_amr",
			eventType: "robot_offline",
			severity:  "high",
		},
		{
			name:      "ubuntu reboot",
			line:      "2026-06-08T12:00:00Z amr-01 systemd-logind: System is rebooting",
			source:    "journald",
			eventType: "ubuntu_server_reboot",
			severity:  "high",
		},
		{
			name:      "ubuntu shutdown",
			line:      "2026-06-08T12:00:00Z amr-01 systemd[1]: Reached target Power-Off",
			source:    "journald",
			eventType: "ubuntu_server_shutdown",
			severity:  "high",
		},
		{
			name:      "proxmox host reboot",
			line:      "Jun  8 12:00:00 pve01 pvedaemon restart requested after node reboot",
			source:    "syslog",
			eventType: "proxmox_host_reboot",
			severity:  "high",
		},
		{
			name:      "proxmox host shutdown",
			line:      "Jun  8 12:00:00 pve01 pvedaemon[123]: PVE host shutdown requested",
			source:    "syslog",
			eventType: "proxmox_host_shutdown",
			severity:  "high",
		},
		{
			name:      "vm reboot",
			line:      "Jun  8 12:00:00 pve01 qm reboot 104 --timeout 60",
			source:    "syslog",
			eventType: "vm_reboot",
			severity:  "medium",
		},
		{
			name:      "vm shutdown",
			line:      "Jun  8 12:00:00 pve01 qm shutdown 104 --timeout 60",
			source:    "syslog",
			eventType: "vm_stopped",
			severity:  "medium",
		},
		{
			name:      "power network event",
			line:      "Jun  8 12:00:00 amr-01 kernel: eth0: link is down",
			source:    "kern.log",
			eventType: "network_dhcp_failure",
			severity:  "medium",
		},
		{
			name:      "unknown event",
			line:      "Jun  8 12:00:00 amr-01 app[123]: operator opened diagnostics panel",
			source:    "syslog",
			eventType: "unknown",
			severity:  "low",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ev := ParseLine(tt.line, tt.source, 7)
			if ev == nil {
				t.Fatal("expected event, got nil")
			}
			if ev.EventType != tt.eventType {
				t.Fatalf("event type = %q, want %q", ev.EventType, tt.eventType)
			}
			if ev.Severity != tt.severity {
				t.Fatalf("severity = %q, want %q", ev.Severity, tt.severity)
			}
		})
	}
}

func TestParseLineSkipsHistoricalRebootOutput(t *testing.T) {
	ev := ParseLine("reboot   system boot  6.8.0-110-generic  Wed Apr 29 10:49 - 15:16 (20+04:27)", "system_info", 7)
	if ev != nil {
		t.Fatalf("expected historical reboot output to be skipped, got %q", ev.EventType)
	}
}
