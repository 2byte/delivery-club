# Soft Delivery - File Sync System

Система для безопасной доставки файлов между хостами с поддержкой шифрования и автоматизации.

## Установка

```bash
bun install
```

## Основные возможности

- 🔐 Шифрование файлов с использованием AES-256-CBC
- 📦 Автоматическое сжатие директорий в ZIP
- 🔄 Git-стиль синхронизации (pull только новых файлов)
- 🎣 **Remote Hooks** - отправка правил обработки файлов на удаленные хосты
- 📝 Логирование всех операций
- 🤫 Режим тихой работы (silent mode)

## Новая функция: Remote Hooks

Remote Hooks позволяет отправлять инструкции по обработке файлов вместе с самими файлами на удаленные хосты.

### Как работает

1. **На отправителе**: в `client.config.json` указываются `remoteHooks` для целевых хостов
2. **При push**: хуки автоматически отправляются на сервер вместе с файлом
3. **При pull**: целевой хост получает хуки и сохраняет их в `localHooks`
4. **Применение**: файлы автоматически обрабатываются согласно хукам

### Пример конфигурации

```json
{
  "hostname": "host_1",
  "serverUrl": "http://server:3000",
  "remoteHooks": {
    "host_2": {
      "onDownloadName": {
        "name": "deployment.zip",
        "extractTo": "C:\\Apps\\Production"
      },
      "moves": {
        "byNames": {
          "config.json": "C:\\ProgramData\\App\\config.json"
        }
      }
    }
  }
}
```

### Быстрый старт

```bash
# Отправка файла с хуками на host_2
bun client.ts push ./app.zip --target-host host_2 --share

# На host_2 получение файла с автоматическим применением хуков
bun client.ts pull
```

## Документация

- 📖 [Remote Hooks Guide](REMOTE_HOOKS.md) - подробное руководство по использованию хуков
- 🔧 [Deployment Options](DEPLOYMENT_OPTIONS.md) - варианты развертывания
- 🚀 [Client Deployment](CLIENT_DEPLOYMENT.md) - развертывание клиента
- 📦 [Build Notes](BUILD_NOTES.md) - заметки по сборке

## Примеры использования

```bash
# Проверить статус сервера
bun client.ts status

# Отправить файл
bun client.ts push ./myfile.txt

# Отправить директорию (автоматически создаст ZIP)
bun client.ts push ./myfolder

# Поделиться файлом с другими хостами
bun client.ts push ./data.zip --share

# Отправить файл конкретному хосту с хуками
bun client.ts push ./deploy.zip --target-host host_2 --share

# Получить новые файлы (git-style)
bun client.ts pull

# Показать файлы на сервере
bun client.ts list

# Показать статус синхронизации
bun client.ts sync-status
```

## Запуск сервера

```bash
bun run index.ts
```

Сервер будет доступен на порту 3000 (по умолчанию).

---

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
