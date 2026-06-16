package ssh

import "testing"

func TestProxmoxVMSelectorDefaultsToAllVMs(t *testing.T) {
	expr, loop := proxmoxVMSelector("")
	if expr != "[0-9]+" {
		t.Fatalf("expr = %q, want all VM regex", expr)
	}
	if loop != "for id in $(qm list 2>/dev/null | awk 'NR>1 {print $1}'); do" {
		t.Fatalf("loop = %q, want qm list loop", loop)
	}
}

func TestProxmoxVMSelectorSupportsSanitizedGlobalList(t *testing.T) {
	expr, loop := proxmoxVMSelector("113, 114\n260003; bad-id 113")
	if expr != "(113|114|260003)" {
		t.Fatalf("expr = %q, want sanitized VM regex", expr)
	}
	if loop != "for id in 113 114 260003; do" {
		t.Fatalf("loop = %q, want sanitized VM loop", loop)
	}
}
