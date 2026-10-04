// Package config хранит настройки компаньона в каталоге пользователя:
// токен сопряжения с сайтом и отметку о первом включении автозапуска.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Settings — содержимое config.json.
type Settings struct {
	// Token — случайный секрет: без него /proxy/ не работает (защита от relay).
	Token string `json:"token"`
	// AutostartInitialized — автозапуск уже включали при первом запуске;
	// дальше пользователь управляет им из трея.
	AutostartInitialized bool `json:"autostartInitialized"`
}

// Dir — каталог настроек: %AppData%, ~/Library/Application Support, ~/.config.
func Dir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "iptv-hub-companion"), nil
}

// Load читает настройки из dir; при первом запуске создаёт токен и сохраняет.
func Load(dir string) (Settings, error) {
	path := filepath.Join(dir, "config.json")
	var s Settings
	data, err := os.ReadFile(path)
	switch {
	case err == nil:
		if err := json.Unmarshal(data, &s); err != nil {
			s = Settings{} // повреждённый файл — начинаем заново с новым токеном
		}
	case !errors.Is(err, fs.ErrNotExist):
		return s, err
	}
	if len(s.Token) < 32 {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			return s, err
		}
		s.Token = hex.EncodeToString(buf)
		if err := Save(dir, s); err != nil {
			return s, err
		}
	}
	return s, nil
}

// Save записывает настройки (только для владельца: в файле секрет).
func Save(dir string, s Settings) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "config.json"), data, 0o600)
}
