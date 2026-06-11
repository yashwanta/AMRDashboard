package handlers

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/yashwanta/AMRDashboard/internal/models"
)

type proxmoxAccessDetails struct {
	ClientIP     string
	User         string
	Time         string
	Method       string
	Path         string
	ResourceType string
	ResourceID   string
	Action       string
}

func enrichLogEvent(ev *models.LogEvent) {
	if ev == nil {
		return
	}
	ev.PlainEnglish = PlainEnglishLog(*ev)
	ev.RecommendedAction = RecommendedAction(*ev)
}

func PlainEnglishLog(ev models.LogEvent) string {
	raw := strings.TrimSpace(ev.RawLine)
	if raw == "" {
		raw = strings.TrimSpace(ev.Message)
	}
	lower := strings.ToLower(raw)

	if access := parseProxmoxAccessDetails(raw); access != nil {
		if access.Action == "console" && access.ResourceType != "" && access.ResourceID != "" {
			return fmt.Sprintf("Someone using %s opened the Proxmox console/VNC session for %s %s from IP %s on %s.", access.User, access.ResourceType, access.ResourceID, access.ClientIP, access.Time)
		}
		return fmt.Sprintf("Someone using %s made a Proxmox API request from IP %s on %s.", access.User, access.ClientIP, access.Time)
	}

	if robotIP := extractRobotIP(raw); ev.EventType == "robot_offline" && robotIP != "" {
		if strings.Contains(lower, "connection refused") {
			return fmt.Sprintf("Robot %s refused the TCP connection.", robotIP)
		}
		if strings.Contains(lower, "remote host closed") {
			return fmt.Sprintf("Robot %s closed the connection unexpectedly.", robotIP)
		}
		if strings.Contains(lower, "timeout") {
			return fmt.Sprintf("The server timed out while trying to reach robot %s.", robotIP)
		}
		return fmt.Sprintf("Robot %s is not connected to the server.", robotIP)
	}

	switch ev.EventType {
	case "ubuntu_server_shutdown":
		return "The Ubuntu server recorded a shutdown sequence."
	case "ubuntu_server_reboot":
		return "The Ubuntu server recorded a reboot sequence."
	case "proxmox_host_shutdown":
		return "The Proxmox host recorded a shutdown-related event."
	case "proxmox_host_reboot":
		return "The Proxmox host recorded a reboot-related event."
	case "vm_stopped":
		return "A virtual machine was stopped or received a shutdown event."
	case "vm_started":
		return "A virtual machine started or returned to running state."
	case "vm_reboot":
		return "A virtual machine recorded or received a reboot event."
	case "vm_killed_by_oom":
		if ev.OOMAnalysis != nil && ev.OOMAnalysis.KilledVMID != "" {
			label := "VM " + ev.OOMAnalysis.KilledVMID
			if ev.OOMAnalysis.KilledVMName != "" {
				label += " (" + ev.OOMAnalysis.KilledVMName + ")"
			}
			return label + " was killed by the Proxmox OOM killer."
		}
		return "A VM process appears to have been killed during an out-of-memory condition."
	case "host_memory_exhaustion":
		return "The host reported memory exhaustion."
	case "swap_full":
		return "The host reported full or exhausted swap."
	case "backup_job":
		return "A backup job or backup-system event was recorded."
	case "backup_found_vm_stopped":
		return "A backup job found the VM was already stopped or not running."
	case "ha_action":
		return "A Proxmox HA action was recorded."
	case "disk_smart_issue", "disk_error":
		return "Storage, disk, filesystem, or SMART health evidence was recorded."
	case "network_dhcp_failure":
		return "A network, DHCP, link, or reachability failure was recorded."
	case "ssh_login_activity":
		return "SSH, sudo, login, or Proxmox access activity was recorded."
	case "service_failure":
		return "A system service failed or entered a failed state."
	case "ubuntu_log_gap":
		return "Ubuntu logs show a gap, rotation, or time discontinuity."
	case "power_network_event":
		return "A power or network signal was recorded."
	case "crash":
		return "A crash, kernel panic, segfault, or core dump event was recorded."
	case "robot_online":
		return "A robot connection returned to an online state."
	case "unknown":
		return "This log line did not match a known category rule."
	}

	if strings.Contains(lower, "segfault") {
		return "A process stopped after a memory access fault."
	}
	if strings.Contains(lower, "out of memory") || strings.Contains(lower, "oom") {
		return "The system reported memory pressure or an OOM kill."
	}
	return "This event was recorded by SiteOps."
}

func RecommendedAction(ev models.LogEvent) string {
	raw := strings.TrimSpace(ev.RawLine)
	if raw == "" {
		raw = strings.TrimSpace(ev.Message)
	}
	lower := strings.ToLower(raw)

	if access := parseProxmoxAccessDetails(raw); access != nil {
		return fmt.Sprintf("Reference only. Concern only if you did not do it, do not recognize %s, or %s should not have been used.", access.ClientIP, access.User)
	}

	if ev.EventType == "robot_offline" {
		if strings.Contains(lower, "timeout") {
			return "Check robot power and network reachability from the server."
		}
		if strings.Contains(lower, "remote host closed") {
			return "Confirm whether the robot was restarted or intentionally disconnected."
		}
		return "Verify robot power, network cabling or Wi-Fi, and the robot service state."
	}
	if ev.EventType == "vm_killed_by_oom" || ev.EventType == "host_memory_exhaustion" || ev.EventType == "swap_full" {
		if ev.OOMAnalysis != nil && ev.OOMAnalysis.Recommendation != "" {
			return ev.OOMAnalysis.Recommendation
		}
		return "Review Proxmox host memory pressure, VM reservations, ballooning, and high-memory processes."
	}
	if strings.Contains(ev.EventType, "shutdown") || strings.Contains(ev.EventType, "reboot") || ev.EventType == "vm_stopped" {
		return "Confirm whether this was planned maintenance. If not, compare nearby power, UPS, and network events."
	}
	if ev.EventType == "ssh_login_activity" {
		return "Confirm whether this was expected administrative activity."
	}
	return ""
}

func parseProxmoxAccessDetails(raw string) *proxmoxAccessDetails {
	log := strings.TrimSpace(raw)
	if !strings.Contains(log, "pveproxy/access.log") && !strings.Contains(log, "/api2/") {
		return nil
	}
	match := regexp.MustCompile(`([0-9]{1,3}(?:\.[0-9]{1,3}){3})\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^"\s]+)`).FindStringSubmatch(log)
	if match == nil {
		match = regexp.MustCompile(`(?:::ffff:)?([0-9a-fA-F:.]+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^"\s]+)`).FindStringSubmatch(log)
	}
	if match == nil {
		return nil
	}
	path, err := url.QueryUnescape(match[5])
	if err != nil {
		path = match[5]
	}
	out := &proxmoxAccessDetails{
		ClientIP: match[1],
		User:     match[2],
		Time:     formatProxmoxAccessTime(match[3]),
		Method:   match[4],
		Path:     path,
		Action:   "api",
	}
	route := regexp.MustCompile(`/api2/(?:json|extjs|html)/nodes/([^/]+)/(lxc|qemu)/([^/]+)/([^?/\s]+)`).FindStringSubmatch(path)
	if route != nil {
		if route[2] == "lxc" {
			out.ResourceType = "LXC container"
		} else if route[2] == "qemu" {
			out.ResourceType = "VM"
		}
		out.ResourceID = route[3]
		if strings.Contains(route[4], "vnc") {
			out.Action = "console"
		}
	}
	if strings.Contains(path, "vnc") {
		out.Action = "console"
	}
	return out
}

func formatProxmoxAccessTime(raw string) string {
	parsed, err := time.Parse("02/01/2006:15:04:05 -0700", raw)
	if err != nil {
		return raw
	}
	return parsed.Format("Jan 2, 2006 at 3:04:05 PM")
}

func extractRobotIP(raw string) string {
	match := regexp.MustCompile(`\[Server:([0-9.]+):`).FindStringSubmatch(raw)
	if match == nil {
		return ""
	}
	return match[1]
}
