import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Класс для работы с JSON базой данных
 * @template T Тип данных, хранящихся в базе
 */
export class DatabaseFile<T = any> {
  private filePath: string;
  private data: T;

  /**
   * @param filePath Путь к JSON файлу
   * @param defaultData Данные по умолчанию, если файл не существует
   */
  constructor(filePath: string, defaultData: T = {} as T) {
    this.filePath = filePath;
    this.data = this.load(defaultData);
  }

  /**
   * Загрузить данные из файла
   */
  private load(defaultData: T): T {
    try {
      if (existsSync(this.filePath)) {
        const fileContent = readFileSync(this.filePath, 'utf-8');
        return JSON.parse(fileContent);
      } else {
        // Создать директорию если не существует
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        // Создать файл с данными по умолчанию
        this.save(defaultData);
        return defaultData;
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      return defaultData;
    }
  }

  /**
   * Сохранить данные в файл
   */
  private save(data: T): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(data, null, 4), 'utf-8');
      this.data = data;
    } catch (error) {
      console.error('Ошибка сохранения данных:', error);
      throw error;
    }
  }

  /**
   * Получить все данные
   */
  getAll(): T {
    return this.data;
  }

  /**
   * Получить значение по ключу
   */
  get<K extends keyof T>(key: K): T[K] {
    return this.data[key];
  }

  /**
   * Установить значение по ключу
   */
  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value;
    this.save(this.data);
  }

  /**
   * Обновить несколько значений
   */
  update(updates: Partial<T>): void {
    this.data = { ...this.data, ...updates };
    this.save(this.data);
  }

  /**
   * Удалить значение по ключу
   */
  delete<K extends keyof T>(key: K): boolean {
    if (key in this.data) {
      delete this.data[key];
      this.save(this.data);
      return true;
    }
    return false;
  }

  /**
   * Очистить все данные
   */
  clear(): void {
    this.data = {} as T;
    this.save(this.data);
  }

  /**
   * Проверить существование ключа
   */
  has<K extends keyof T>(key: K): boolean {
    return key in this.data;
  }

  /**
   * Получить все ключи
   */
  keys(): string[] {
    return Object.keys(this.data);
  }

  /**
   * Получить все значения
   */
  values(): any[] {
    return Object.values(this.data);
  }

  /**
   * Получить все записи [ключ, значение]
   */
  entries(): [string, any][] {
    return Object.entries(this.data);
  }

  /**
   * Перезагрузить данные из файла
   */
  reload(): void {
    this.data = this.load(this.data);
  }

  /**
   * Получить путь к файлу
   */
  getFilePath(): string {
    return this.filePath;
  }
}
