package proxy

import (
	"context"
	"errors"
	"net"
	"net/netip"
	"syscall"
)

// ErrForbiddenTarget — адрес назначения локальный или приватный.
var ErrForbiddenTarget = errors.New("forbidden upstream address")

// forbidden: компаньон не ходит в loopback, приватные сети, link-local и
// служебные диапазоны. Иначе любая открытая вкладка могла бы через него
// дёргать роутер и устройства домашней сети (SSRF). Домашние IPTV-серверы
// сайт и так открывает напрямую — прокси им не нужен.
func forbidden(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() || addr.IsUnspecified() || addr.IsInterfaceLocalMulticast() ||
		cgnat.Contains(addr) || !addr.IsValid()
}

var cgnat = netip.MustParsePrefix("100.64.0.0/10")

// guardedControl проверяет IP уже после DNS-разрешения, прямо перед
// соединением: подмена DNS (rebinding) не обходит запрет.
func guardedControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	addr, err := netip.ParseAddr(host)
	if err != nil || forbidden(addr) {
		return ErrForbiddenTarget
	}
	return nil
}

// newDialer — Dialer с проверкой адреса назначения. allowLocal — только для тестов.
func newDialer(allowLocal bool) func(ctx context.Context, network, address string) (net.Conn, error) {
	d := &net.Dialer{}
	if !allowLocal {
		d.Control = guardedControl
	}
	return d.DialContext
}
