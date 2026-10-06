#!/usr/bin/env python3
"""
Инженерный калькулятор - HTTP сервер
Раздаёт файлы калькулятора на http://localhost:<порт> и открывает его в браузере.
Сам счёт идёт в браузере (calc-engine.js), сервер только отдаёт файлы.

Запуск: python3 server.py [порт]        (по умолчанию 8080)
"""

import errno
import http.server
import os
import sys
import webbrowser

# Устанавливаем рабочую директорию
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

DEFAULT_PORT = 8080
HOST = '127.0.0.1'  # только этот компьютер: из локальной сети калькулятор не виден


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP обработчик с подавленными логами"""

    def log_message(self, format, *args):
        """Подавляем стандартные логи"""
        pass

    def end_headers(self):
        """Без кэша: после правки файлов браузер сразу получает новую версию"""
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def parse_port(argv):
    """Порт из первого аргумента командной строки"""
    if len(argv) < 2:
        return DEFAULT_PORT
    if argv[1].isdigit() and 1 <= int(argv[1]) <= 65535:
        return int(argv[1])
    print(f"❌ Ошибка: «{argv[1]}» — не номер порта (нужно число от 1 до 65535)")
    sys.exit(2)


def open_browser(url):
    """Открывает калькулятор в браузере"""
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"⚠️  Не удалось открыть браузер: {e}")
        print(f"   Откройте вручную: {url}")


def print_banner(url):
    """Выводит приветственный баннер"""
    print()
    print("=" * 60)
    print("  🔬 ИНЖЕНЕРНЫЙ КАЛЬКУЛЯТОР")
    print("=" * 60)
    print()
    print("  🌐 Сервер запущен:")
    print(f"     {url}")
    print()
    print("  📁 Рабочая директория:")
    print(f"     {SCRIPT_DIR}")
    print()
    print("  ⌨️  Для остановки нажмите Ctrl+C")
    print("=" * 60)
    print()


def main():
    """Основная функция"""
    port = parse_port(sys.argv)
    url = f'http://localhost:{port}'

    try:
        # Многопоточный сервер: браузер держит несколько соединений сразу,
        # и однопоточный сервер на этом подвисает
        httpd = http.server.ThreadingHTTPServer((HOST, port), QuietHandler)
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            print(f"❌ Ошибка: Порт {port} уже используется!")
            print()
            print("  Решения:")
            print(f"    1. Закройте программу, которая занимает порт {port}")
            print(f"    2. Или запустите с другим портом: python3 server.py {port + 1}")
            print()
        else:
            print(f"❌ Ошибка: {e}")
        sys.exit(1)

    with httpd:
        print_banner(url)
        # Порт уже открыт — страница загрузится сразу, ждать не нужно
        open_browser(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
            print("  🛑 Сервер остановлен. Спасибо за использование!")
            print()


if __name__ == "__main__":
    main()
