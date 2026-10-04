// Package autostart включает запуск компаньона при входе в систему:
// Windows — ключ HKCU\...\Run, macOS — LaunchAgent, Linux — XDG autostart.
// Права администратора не нужны: всё в профиле пользователя.
package autostart

// Name — имя записи автозапуска.
const Name = "IPTV Hub Companion"

// Label — идентификатор LaunchAgent и имя .desktop-файла.
const Label = "io.github.ozyab09.iptvhub.companion"
