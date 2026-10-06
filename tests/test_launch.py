"""
Проверки запуска (разрывы Р19–Р22 в docs/KALKULYATOR-RAZBOR.md).
Запуск: python3 tests/test_launch.py
Браузер не открывается: BROWSER=true подменяет его командой /usr/bin/true.
"""

import os
import signal
import socket
import subprocess
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(os.environ, BROWSER='true')


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def listening(port, host='127.0.0.1'):
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex((host, port)) == 0


def wait_listening(port, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if listening(port):
            return True
        time.sleep(0.1)
    return False


def lan_address():
    """Адрес компьютера в локальной сети (UDP connect ничего не отправляет)"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('192.0.2.1', 80))
            address = s.getsockname()[0]
    except OSError:
        return None
    return None if address.startswith('127.') else address


def start(*cmd):
    # SIGINT по умолчанию, как у программы в окне терминала: фоновые задачи shell его игнорируют
    return subprocess.Popen(cmd, cwd=ROOT, env=ENV, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            preexec_fn=lambda: signal.signal(signal.SIGINT, signal.SIG_DFL))


def run(*cmd):
    return subprocess.run(cmd, cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=10)


class LaunchTest(unittest.TestCase):

    def start_server(self, *cmd):
        proc = start(*cmd)

        def stop():
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            proc.stdout.close()

        self.addCleanup(stop)
        return proc

    def press_ctrl_c(self, proc):
        proc.send_signal(signal.SIGINT)
        out, _ = proc.communicate(timeout=5)
        return out

    def test_port_from_argument_and_ctrl_c(self):
        port = free_port()
        proc = self.start_server('python3', 'server.py', str(port))
        self.assertTrue(wait_listening(port), 'сервер не открыл порт из аргумента')
        out = self.press_ctrl_c(proc)
        self.assertEqual(proc.returncode, 0)
        self.assertIn('Сервер остановлен', out)

    def test_not_visible_from_local_network(self):
        address = lan_address()
        if address is None:
            self.skipTest('нет сетевого интерфейса кроме 127.0.0.1')
        port = free_port()
        self.start_server('python3', 'server.py', str(port))
        self.assertTrue(wait_listening(port))
        self.assertFalse(listening(port, address), f'сервер отвечает на {address}:{port}')

    def test_busy_port_leaves_other_program_alive(self):
        port = free_port()
        other = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(lambda: (other.kill(), other.wait()))
        self.assertTrue(wait_listening(port))
        result = run('python3', 'server.py', str(port))
        self.assertEqual(result.returncode, 1)
        self.assertIn('уже используется', result.stdout)
        self.assertIsNone(other.poll(), 'программу, занявшую порт, трогать нельзя')

    def test_bad_port_argument(self):
        result = run('python3', 'server.py', 'abc')
        self.assertEqual(result.returncode, 2)
        self.assertIn('не номер порта', result.stdout)

    def test_start_command_passes_port(self):
        self.assertTrue(os.access(os.path.join(ROOT, 'start.command'), os.X_OK),
                        'start.command должен быть исполняемым — иначе не запустится двойным кликом')
        port = free_port()
        proc = self.start_server('bash', 'start.command', str(port))
        self.assertTrue(wait_listening(port), 'порт из аргумента не дошёл до server.py')
        out = self.press_ctrl_c(proc)
        self.assertIn(f'http://localhost:{port}', out)


if __name__ == '__main__':
    unittest.main()
