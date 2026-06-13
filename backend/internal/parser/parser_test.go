package parser

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

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

func TestParseLineClassifiesProxmoxOOM(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		eventType string
	}{
		{
			name:      "qemu scope killed",
			line:      "Jun  5 22:06:01 pve kernel: Out of memory: Killed process 12345 (kvm) total-vm:17500000kB task_memcg:/qemu.slice/113.scope",
			eventType: "vm_killed_by_oom",
		},
		{
			name:      "host oom",
			line:      "Jun  5 22:05:59 pve kernel: node invoked oom-killer: gfp_mask=0x140cca",
			eventType: "host_memory_exhaustion",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ev := ParseLine(tt.line, "proxmox_host_memory", 7)
			if ev == nil {
				t.Fatal("expected event, got nil")
			}
			if ev.EventType != tt.eventType {
				t.Fatalf("event type = %q, want %q", ev.EventType, tt.eventType)
			}
		})
	}
}

func TestParseLineParsesProxmoxOffsetTimestamp(t *testing.T) {
	ev := ParseLine("2026-06-05T22:06:01-0500 pve kernel: oom-kill:task_memcg=/qemu.slice/113.scope,task=kvm,pid=2915632", "proxmox_journal", 7)
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	want := time.Date(2026, 6, 6, 3, 6, 1, 0, time.UTC)
	if !ev.Timestamp.Equal(want) {
		t.Fatalf("timestamp = %s, want %s", ev.Timestamp, want)
	}
	if ev.EventType != "vm_killed_by_oom" {
		t.Fatalf("event type = %q, want vm_killed_by_oom", ev.EventType)
	}
}

func TestParseLineSkipsRootHistorySearchCommands(t *testing.T) {
	ev := ParseLine(`/root/.bash_history:498:journalctl --since "2026-06-05 22:05:30" --until "2026-06-05 22:06:30" --no-pager | egrep -i "oom|out of memory|killed process|113.scope|qemu.slice|kvm"`, "proxmox_root_history@10.222.10.50", 7)
	if ev != nil {
		t.Fatalf("expected root history search command to be skipped, got %q", ev.EventType)
	}
}

func TestParseLineClassifiesProxmoxConsoleAccessAsLoginActivity(t *testing.T) {
	ev := ParseLine(`/var/log/pveproxy/access.log.1:15474:::ffff:10.2.1.60 - root@pam [08/06/2026:16:23:59 -0500] "GET /api2/json/nodes/pve/lxc/109/vncwebsocket?port=5900&vncticket=PVEVNC%3A6A2732EF%3A%3AOoM9JCEP5eSfKoyVT6uA3mHkMO556aOdmfOU0bZZO HTTP/1.1" 101 0`, "proxmox_tasks@10.222.10.50", 7)
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.EventType != "ssh_login_activity" {
		t.Fatalf("event type = %q, want ssh_login_activity", ev.EventType)
	}
}

func TestParseLineSkipsCollectionCommandContinuation(t *testing.T) {
	ev := ParseLine(`2026-06-08T07:25:53-05:00 host sudo[322080]: fleetmanager : (command continued) "shutdown|reboot|oom|out of memory|killed process"`, "journald_amr", 7)
	if ev != nil {
		t.Fatalf("expected collection command continuation to be skipped, got %q", ev.EventType)
	}
}

func TestParseOutputCapsUnknownEvents(t *testing.T) {
	var lines []string
	for i := 0; i < 150; i++ {
		lines = append(lines, "2026-06-08T12:00:00Z pve process informational line")
	}
	events := ParseOutput(strings.Join(lines, "\n"), "proxmox_journal", 7)
	if len(events) != 1 {
		t.Fatalf("dedupe should collapse identical unknown events to 1, got %d", len(events))
	}

	lines = lines[:0]
	for i := 0; i < 150; i++ {
		lines = append(lines, "2026-06-08T12:00:00Z pve process informational line "+strconv.Itoa(i))
	}
	events = ParseOutput(strings.Join(lines, "\n"), "proxmox_journal", 7)
	if len(events) != 100 {
		t.Fatalf("unknown event cap = %d, want 100", len(events))
	}
}
