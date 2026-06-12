package handlers

import (
	"strings"
	"testing"
)

func TestBuildPackageInstallUsesSudoPasswordButAuditMasksIt(t *testing.T) {
	handler := NewActionHandler(nil, "", false)
	req := actionRunRequest{
		Action:       "package_install",
		PackageName:  "curl",
		SudoPassword: "Secret123!",
	}

	command, err := handler.buildCommand(req)
	if err != nil {
		t.Fatalf("buildCommand returned error: %v", err)
	}
	if !strings.Contains(command, "apt-get install -y 'curl'") {
		t.Fatalf("expected apt install command, got %q", command)
	}
	if !strings.Contains(command, "Secret123!") {
		t.Fatalf("runtime command should include sudo password pipe, got %q", command)
	}

	audit := auditCommand(command, req)
	if strings.Contains(audit, "Secret123!") {
		t.Fatalf("audit command leaked sudo password: %q", audit)
	}
	if !strings.Contains(audit, "'******'") {
		t.Fatalf("expected masked sudo password in audit command, got %q", audit)
	}
}

func TestBuildCVERemediationUsesLinuxSigned(t *testing.T) {
	handler := NewActionHandler(nil, "", false)
	req := actionRunRequest{
		Action:       "remediate_cve_2026_31431_linux_signed",
		SudoPassword: "Secret123!",
	}

	command, err := handler.buildCommand(req)
	if err != nil {
		t.Fatalf("buildCommand returned error: %v", err)
	}
	if !strings.Contains(command, "apt-get update") {
		t.Fatalf("expected apt-get update command, got %q", command)
	}
	if !strings.Contains(command, "apt-get install -y linux-signed") {
		t.Fatalf("expected linux-signed install command, got %q", command)
	}
	if strings.Contains(auditCommand(command, req), "Secret123!") {
		t.Fatalf("audit command leaked sudo password")
	}
}

func TestApprovedCustomCommandAllowsCVERemediationTemplate(t *testing.T) {
	handler := NewActionHandler(nil, "", false)
	req := actionRunRequest{
		Action:       "approved_custom_command",
		Command:      "sudo apt-get update && sudo apt-get install -y linux-signed",
		SudoPassword: "Secret123!",
	}

	command, err := handler.buildCommand(req)
	if err != nil {
		t.Fatalf("buildCommand returned error: %v", err)
	}
	if !strings.Contains(command, "apt-get update") || !strings.Contains(command, "apt-get install -y linux-signed") {
		t.Fatalf("expected approved CVE remediation command, got %q", command)
	}
	if !strings.Contains(command, "sudo -S") {
		t.Fatalf("expected sudo password path, got %q", command)
	}
	if strings.Contains(auditCommand(command, req), "Secret123!") {
		t.Fatalf("audit command leaked sudo password")
	}
}

func TestApprovedCustomCommandRejectsShellMetacharacters(t *testing.T) {
	handler := NewActionHandler(nil, "", false)
	req := actionRunRequest{
		Action:  "approved_custom_command",
		Command: "apt-get update; cat /etc/shadow",
	}

	if _, err := handler.buildCommand(req); err == nil {
		t.Fatalf("expected shell metacharacter command to be rejected")
	}
}
