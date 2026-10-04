package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTokenIsCreatedOnceAndPersisted(t *testing.T) {
	dir := t.TempDir()
	first, err := Load(dir)
	if err != nil || len(first.Token) != 64 {
		t.Fatalf("first load: %v %q", err, first.Token)
	}
	second, err := Load(dir)
	if err != nil || second.Token != first.Token {
		t.Fatalf("token must persist: %q vs %q", second.Token, first.Token)
	}
	first.AutostartInitialized = true
	if err := Save(dir, first); err != nil {
		t.Fatal(err)
	}
	third, _ := Load(dir)
	if !third.AutostartInitialized {
		t.Fatal("autostart flag must persist")
	}
}

func TestDamagedConfigGetsNewToken(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte("{oops"), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Load(dir)
	if err != nil || len(s.Token) != 64 {
		t.Fatalf("damaged config: %v %q", err, s.Token)
	}
}
