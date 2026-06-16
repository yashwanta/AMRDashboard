package handlers

import (
	"testing"

	"github.com/yashwanta/AMRDashboard/internal/models"
)

func TestAMREvidenceClassification(t *testing.T) {
	tests := []struct {
		name       string
		event      models.LogEvent
		class      string
		confidence string
		target     string
	}{
		{
			name: "executed robot command",
			event: models.LogEvent{
				EventType: "amr_charge_command",
				Source:    "roboshop_app",
				RawLine:   `Roboshop.desktop Send:[2011]robot_other_setchargingrelay_req {"robot":"AMR01"}`,
			},
			class:      "executed_command",
			confidence: "high",
		},
		{
			name: "admin search is not execution",
			event: models.LogEvent{
				EventType: "admin_evidence_search",
				Source:    "auth.log",
				RawLine:   `sudo: admin : TTY=pts/0 ; COMMAND=/usr/bin/grep -R robot_other_setchargingrelay_req /opt/Roboshop`,
			},
			class:      "admin_evidence_search",
			confidence: "low",
		},
		{
			name: "sudo bash grep with action keywords is not execution",
			event: models.LogEvent{
				EventType: "admin_evidence_search",
				Source:    "auth.log",
				RawLine:   `sudo[1235]: operator : COMMAND=/usr/bin/bash -c 'grep -RniE "battery|charge|dock|reset|default|config" /opt/Roboshop'`,
			},
			class:      "admin_evidence_search",
			confidence: "low",
		},
		{
			name: "template reference is not execution",
			event: models.LogEvent{
				EventType: "template_code_reference",
				Source:    "rds_file_logs",
				RawLine:   `/opt/Roboshop/bin/appInfo/setting/Editor/seer-task/template.json: robot_other_setchargingrelay_req`,
			},
			class:      "template_code_reference",
			confidence: "low",
		},
		{
			name: "go target extracts station id",
			event: models.LogEvent{
				EventType: "amr_gotarget_station",
				Source:    "journald_robod",
				RawLine:   `Client To Server: 函数:[robot_task_gotarget_req] {"id":"PP66"}`,
			},
			class:      "executed_command",
			confidence: "high",
			target:     "PP66",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			class, confidence, _, targets := AMREvidenceClassification(tt.event)
			if class != tt.class {
				t.Fatalf("class = %q, want %q", class, tt.class)
			}
			if confidence != tt.confidence {
				t.Fatalf("confidence = %q, want %q", confidence, tt.confidence)
			}
			if tt.target != "" && (len(targets) == 0 || targets[0] != tt.target) {
				t.Fatalf("targets = %#v, want first %q", targets, tt.target)
			}
		})
	}
}
