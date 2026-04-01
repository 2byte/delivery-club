# Remote Hooks Feature

## Описание

Механизм **Remote Hooks** позволяет отправлять инструкции по обработке файлов на удаленные хосты. Когда вы делаете `push` файла на другой хост, вы можете отправить вместе с ним хуки, которые будут автоматически применены на целевом хосте при `pull`.

## Принцип работы

### 1. Отправка хуков (push)

Когда вы делаете `push` файла на удаленный хост, клиент проверяет наличие `remoteHooks` в конфигурации:

```json
{
  "remoteHooks": {
    "host_2": {
      "onDownloadName": {
        "test_file.zip": {
          "name": "deployment.zip",
          "extractTo": "C:\\Apps\\Deployment"
        }
      },
      "moves": {
        "byNames": {
          "settings.json": "C:\\ProgramData\\MyApp\\settings.json"
        }
      }
    }
  }
}
```

Если в `remoteHooks` есть конфигурация для целевого хоста (`host_2`), эти хуки отправляются вместе с файлом на сервер.

### 2. Хранение на сервере

Сервер сохраняет хуки в отдельном файле рядом с загруженным файлом:
- Файл: `host_2_deployment.zip_2026-01-11T12-00-00-000Z`
- Хуки: `host_2_deployment.zip_2026-01-11T12-00-00-000Z.hooks.json`

### 3. Получение хуков (pull)

Когда целевой хост (`host_2`) делает `pull`:

1. Сервер отправляет информацию о файлах вместе с хуками
2. Клиент получает хуки и автоматически записывает их в `localHooks` в `client.config.json`
3. Конфигурация перезагружается
4. Файл обрабатывается согласно новым хукам

## Типы хуков

### onDownloadName

Автоматически извлекает ZIP-архив в указанную директорию:

```json
{
  "onDownloadName": {
    "name": "myapp.zip",
    "extractTo": "C:\\Program Files\\MyApp"
  }
}
```

- `name` - имя файла, для которого применяется правило
- `extractTo` - путь для извлечения содержимого ZIP-архива

### moves.byNames

Перемещает конкретные файлы в указанные места:

```json
{
  "moves": {
    "byNames": {
      "config.json": "C:\\Users\\Admin\\AppData\\config.json",
      "data.db": "C:\\Data\\database\\data.db",
      "app.exe": "C:\\Program Files\\MyApp\\app.exe"
    }
  }
}
```

- Ключ - исходное имя файла
- Значение - целевой путь для перемещения

## Примеры использования

### Пример 1: Развертывание приложения

**На host_1** (отправитель):

`client.config.json`:
```json
{
  "hostname": "host_1",
  "remoteHooks": {
    "host_2": {
      "onDownloadName": {
        "name": "myapp.zip",
        "extractTo": "C:\\Program Files\\MyApp"
      },
      "moves": {
        "byNames": {
          "config.json": "C:\\ProgramData\\MyApp\\config.json"
        }
      }
    }
  }
}
```

Отправка:
```bash
bun client.ts push ./myapp.zip --target-host host_2 --share
```

**На host_2** (получатель):

```bash
bun client.ts pull
```

Результат:
- `myapp.zip` автоматически извлечется в `C:\\Program Files\\MyApp`
- `config.json` переместится в `C:\\ProgramData\\MyApp\\config.json`
- Хуки сохранятся в `localHooks` для будущих обновлений

### Пример 2: Обновление конфигурации

**На host_1**:

`client.config.json`:
```json
{
  "remoteHooks": {
    "host_2": {
      "moves": {
        "byNames": {
          "new_config.json": "C:\\App\\config.json",
          "database.db": "C:\\App\\data\\database.db"
        }
      }
    }
  }
}
```

Отправка:
```bash
bun client.ts push ./configs/new_config.json --target-host host_2 --share
```

**На host_2**:
```bash
bun client.ts pull
```

Файл автоматически переместится в `C:\\App\\config.json`.

### Пример 3: Множество хостов

Можно настроить хуки для разных хостов:

```json
{
  "remoteHooks": {
    "host_2": {
      "onDownloadName": {
        "name": "app.zip",
        "extractTo": "C:\\Apps\\Production"
      }
    },
    "host_3": {
      "onDownloadName": {
        "name": "app.zip",
        "extractTo": "C:\\Apps\\Staging"
      }
    },
    "host_4": {
      "onDownloadName": {
        "name": "app.zip",
        "extractTo": "C:\\Apps\\Development"
      }
    }
  }
}
```

## Важные замечания

1. **Автоматическое обновление конфигурации**: При получении файла с хуками, `localHooks` в `client.config.json` полностью перезаписывается

2. **Приоритет хуков**: 
   - `localHooks` - локальные правила для текущего хоста
   - `remoteHooks` - правила для отправки на другие хосты
   - При pull полученные хуки записываются в `localHooks`

3. **Безопасность**: Хуки позволяют управлять файловой системой удаленного хоста, поэтому:
   - Используйте только в доверенных сетях
   - Проверяйте пути перед отправкой
   - Ограничьте права доступа к `client.config.json`

4. **Логирование**: Все операции с хуками логируются:
   ```
   [INFO] Sending hooks to host_2
   [INFO] File has hooks, updating config...
   [INFO] Hooks saved to config as localHooks
   ```

## Технические детали

### Формат хранения на сервере

Файл: `storage/files_for_hosts/host_2_myapp.zip_2026-01-11T12-00-00-000Z`

Хуки: `storage/files_for_hosts/host_2_myapp.zip_2026-01-11T12-00-00-000Z.hooks.json`:
```json
{
  "onDownloadName": {
    "name": "myapp.zip",
    "extractTo": "C:\\Program Files\\MyApp"
  },
  "moves": {
    "byNames": {
      "config.json": "C:\\ProgramData\\MyApp\\config.json"
    }
  }
}
```

### API изменения

**POST /push** - принимает дополнительное поле:
```
formData.append("hooks", JSON.stringify(hooks))
```

**POST /pull** - возвращает хуки в массиве файлов:
```json
{
  "newFiles": [
    {
      "storedName": "host_2_myapp.zip_...",
      "originalName": "myapp.zip",
      "hooks": { ... }
    }
  ]
}
```

## Workflow схема

```
┌─────────┐                    ┌────────┐                    ┌─────────┐
│ Host 1  │                    │ Server │                    │ Host 2  │
└────┬────┘                    └───┬────┘                    └────┬────┘
     │                             │                              │
     │ push file + remoteHooks     │                              │
     │────────────────────────────>│                              │
     │                             │ Save file + hooks            │
     │                             │ (.hooks.json)                │
     │                             │                              │
     │                             │<─────────────────────────────│
     │                             │          pull request        │
     │                             │                              │
     │                             │──────────────────────────────>
     │                             │   file list + hooks          │
     │                             │                              │
     │                             │<─────────────────────────────│
     │                             │    download file request     │
     │                             │                              │
     │                             │──────────────────────────────>
     │                             │         file data            │
     │                             │                              │
     │                             │                         Apply hooks:
     │                             │                         1. Save to localHooks
     │                             │                         2. Extract/Move files
     │                             │                              │
```

## Устранение неполадок

### Хуки не применяются

1. Проверьте логи: `./logs/client.log`
2. Убедитесь, что `remoteHooks` содержит правильный hostname
3. Проверьте формат JSON в конфигурации

### Файлы не перемещаются

1. Проверьте права доступа к целевым директориям
2. Убедитесь, что пути в `moves.byNames` корректны
3. Проверьте, что имена файлов точно совпадают

### Хуки перезаписываются

Это нормальное поведение - при pull новые хуки полностью заменяют `localHooks`. Если нужно сохранить старые правила, создайте резервную копию конфигурации.
