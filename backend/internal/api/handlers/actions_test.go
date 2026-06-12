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
