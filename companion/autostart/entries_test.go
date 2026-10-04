package autostart

import (
	"strings"
	"testing"
)

func TestEntriesLaunchInBackground(t *testing.T) {
	p := plist("/Applications/IPTV Hub Companion & Co")
	if !strings.Contains(p, "<string>/Applications/IPTV Hub Companion &amp; Co</string><string>-background</string>") || !strings.Contains(p, "<key>RunAtLoad</key><true/>") {
		t.Fatalf("plist:\n%s", p)
	}
	d := desktopEntry("/opt/iptv hub/companion")
	if !strings.Contains(d, "Exec=\"/opt/iptv hub/companion\" -background\n") || !strings.Contains(d, "Type=Application") {
		t.Fatalf("desktop:\n%s", d)
	}
}
