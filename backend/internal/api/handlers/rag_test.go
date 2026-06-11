package handlers

import (
	"strings"
	"testing"
	"time"
)

func TestPatchInventoryQuestionWithoutRunsDoesNotUseGenericLogs(t *testing.T) {
	if !isPatchInventoryQuestion("Which servers missing patching?") {
		t.Fatal("expected missing patching question to use patch inventory path")
	}

	answer := buildPatchInventoryAnswer(nil)
	if !strings.Contains(answer, "I do not have patch inventory yet") {
		t.Fatalf("expected no-inventory answer, got %q", answer)
	}
	if strings.Contains(answer, "Based on the current SiteOps logs") {
		t.Fatalf("patch inventory answer should not use generic log wording: %q", answer)
	}
}

func TestBuildPatchInventoryAnswerSummarizesRuns(t *testing.T) {
	checkedAt := time.Date(2026, 6, 11, 14, 30, 0, 0, time.UTC)
	answer := buildPatchInventoryAnswer([]patchRunSummary{
		{
			ServerName: "Hop-Fleetmanager",
			Action:     "package_list_upgrades",
			Status:     "success",
			Output:     "Listing...\nopenssl/stable-security 3.0 upgradable\n",
			CreatedAt:  checkedAt,
		},
		{
			ServerName: "Spr-PVE",
			Action:     "package_upgrade_dry_run",
			Status:     "success",
			Output:     "0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
			CreatedAt:  checkedAt.Add(-time.Hour),
		},
	})

	for _, want := range []string{
		"patch inventory for 2 server(s)",
		"Likely missing patches: Hop-Fleetmanager.",
		"No available upgrades detected: Spr-PVE.",
	} {
		if !strings.Contains(answer, want) {
			t.Fatalf("answer missing %q: %q", want, answer)
		}
	}
}
