//go:build darwin

package autostart

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

func plistPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "LaunchAgents", Label+".plist"), nil
}

// Enabled — есть ли LaunchAgent.
func Enabled() (bool, error) {
	p, err := plistPath()
	if err != nil {
		return false, err
	}
	_, err = os.Stat(p)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

// Enable пишет LaunchAgent с RunAtLoad.
func Enable(exe string) error {
	p, err := plistPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	return os.WriteFile(p, []byte(plist(exe)), 0o644)
}

// Disable удаляет LaunchAgent.
func Disable() error {
	p, err := plistPath()
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
