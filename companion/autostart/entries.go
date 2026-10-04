package autostart

import "strings"

// plist — LaunchAgent macOS: запуск при входе, без перезапуска при выходе.
func plist(exe string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>` + Label + `</string>
  <key>ProgramArguments</key>
  <array><string>` + xmlEscape(exe) + `</string><string>-background</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`
}

// desktopEntry — XDG autostart (GNOME, KDE, XFCE …).
func desktopEntry(exe string) string {
	return "[Desktop Entry]\nType=Application\nName=" + Name + "\nExec=\"" + strings.ReplaceAll(exe, `"`, `\"`) + "\" -background\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n"
}

func xmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(s)
}
