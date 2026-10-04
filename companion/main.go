// IPTV Hub Companion (#452, #463) — локальный помощник для http-плейлистов.
//
// Сайт IPTV Hub на GitHub Pages открывается по https, и браузер блокирует
// http-плейлисты и потоки (mixed content) и потоки без CORS. Компаньон
// слушает только 127.0.0.1, загружает такие ресурсы сам и отдаёт их сайту.
// Внешних серверов нет, ссылки не покидают устройство и не логируются.
package main

import (
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"fyne.io/systray"

	"github.com/ozyab09/iptv-hub/companion/autostart"
	"github.com/ozyab09/iptv-hub/companion/config"
	"github.com/ozyab09/iptv-hub/companion/proxy"
)

// version подставляет сборка: -ldflags "-X main.version=…".
var version = "dev"

// DefaultPort — порт, который ищет сайт.
const DefaultPort = 47800

// SiteURL — сайт, которому разрешено пользоваться компаньоном (и который открывает трей).
const SiteURL = "https://ozyab09.github.io/iptv-hub/"

var (
	//go:embed assets/icon.png
	iconPNG []byte
	//go:embed assets/icon.ico
	iconICO []byte
)

type originList []string

func (o *originList) String() string     { return strings.Join(*o, ",") }
func (o *originList) Set(v string) error { *o = append(*o, v); return nil }

func main() {
	port := flag.Int("port", DefaultPort, "порт на 127.0.0.1")
	background := flag.Bool("background", false, "запуск при входе в систему: не открывать сайт")
	headless := flag.Bool("headless", false, "без значка в трее (серверы, отладка)")
	var extra originList
	flag.Var(&extra, "origin", "дополнительный разрешённый сайт (можно несколько), например http://localhost:5173")
	flag.Parse()

	dir, err := config.Dir()
	if err != nil {
		log.Fatalf("config dir: %v", err)
	}
	settings, err := config.Load(dir)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		// Уже запущен (второй двойной клик или автозапуск): просто открываем сайт.
		if alreadyRunning(*port) {
			if !*background {
				openBrowser(SiteURL + "?companion=1")
			}
			return
		}
		log.Fatalf("порт %d занят другой программой: %v", *port, err)
	}

	origins := append([]string{strings.TrimSuffix(siteOrigin(), "/")}, extra...)
	server := proxy.New(proxy.Config{Port: *port, Token: settings.Token, Version: version, Origins: origins})
	httpServer := &http.Server{Handler: server, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server: %v", err)
		}
	}()

	exe, _ := os.Executable()
	if exe != "" {
		exe, _ = filepath.EvalSymlinks(exe)
	}
	// Автозапуск включён по умолчанию при первом запуске; дальше — галочка в трее.
	// Без трея (-headless: серверы, отладка) автозапуск не трогаем.
	if !*headless && !settings.AutostartInitialized && exe != "" {
		if err := autostart.Enable(exe); err != nil {
			log.Printf("autostart: %v", err)
		}
		settings.AutostartInitialized = true
		_ = config.Save(dir, settings)
	}
	if !*background {
		openBrowser(SiteURL + "?companion=1")
	}
	if *headless {
		select {}
	}
	systray.Run(func() { onReady(*port, exe) }, func() { _ = httpServer.Close() })
}

func siteOrigin() string {
	// https://ozyab09.github.io/iptv-hub/ → https://ozyab09.github.io
	rest := strings.TrimPrefix(SiteURL, "https://")
	return "https://" + strings.SplitN(rest, "/", 2)[0]
}

func onReady(port int, exe string) {
	if runtime.GOOS == "windows" {
		systray.SetIcon(iconICO)
	} else {
		systray.SetIcon(iconPNG)
	}
	systray.SetTooltip("IPTV Hub Companion")
	status := systray.AddMenuItem(fmt.Sprintf("IPTV Hub Companion %s · порт %d", version, port), "")
	status.Disable()
	open := systray.AddMenuItem("Открыть IPTV Hub", "Открыть сайт с подключённым компаньоном")
	enabled, _ := autostart.Enabled()
	auto := systray.AddMenuItemCheckbox("Запускать при входе в систему", "", enabled)
	systray.AddSeparator()
	quit := systray.AddMenuItem("Выход", "Остановить компаньон")
	go func() {
		for {
			select {
			case <-open.ClickedCh:
				openBrowser(SiteURL + "?companion=1")
			case <-auto.ClickedCh:
				if auto.Checked() {
					if err := autostart.Disable(); err == nil {
						auto.Uncheck()
					}
				} else if exe != "" {
					if err := autostart.Enable(exe); err == nil {
						auto.Check()
					}
				}
			case <-quit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

// alreadyRunning — на порту отвечает именно компаньон (а не чужая программа).
func alreadyRunning(port int) bool {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	return strings.Contains(string(buf[:n]), "iptv-hub-companion")
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("open browser: %v", err)
	}
}
