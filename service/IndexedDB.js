// IndexedDB Manager for file storage
class IndexedDBManager {
    constructor(dbName = 'fileStorage', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Tạo object store cho files nếu chưa tồn tại
                if (!db.objectStoreNames.contains('files')) {
                    const fileStore = db.createObjectStore('files', { keyPath: 'id' });
                    fileStore.createIndex('filename', 'filename', { unique: false });
                    fileStore.createIndex('type', 'type', { unique: false });
                    fileStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Tạo object store cho tasks nếu chưa tồn tại
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    taskStore.createIndex('status', 'status', { unique: false });
                    taskStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            
            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // Store a file in the database
    async storeFile(file, filename, type = 'application/octet-stream') {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            
            // Đọc file trước
            const reader = new FileReader();
            reader.onload = (event) => {
                const fileData = {
                    id: Date.now().toString(),
                    filename: filename,
                    type: type,
                    data: event.target.result,
                    timestamp: new Date().getTime()
                };
                
                // Tạo transaction mới để thêm dữ liệu
                const addTransaction = this.db.transaction(['files'], 'readwrite');
                const addStore = addTransaction.objectStore('files');
                const request = addStore.add(fileData);
                
                request.onsuccess = () => resolve(fileData.id);
                request.onerror = (e) => {
                    console.error('Error storing file:', e.target.error);
                    reject(new Error('Không thể lưu file vào IndexedDB'));
                };
            };
            
            reader.onerror = (e) => {
                console.error('Error reading file:', e);
                reject(new Error('Không thể đọc file'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    // Store a zip file from a blob
    async storeZipFile(blob, filename) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            
            // Đọc blob trước
            const reader = new FileReader();
            reader.onload = (event) => {
                const fileData = {
                    id: Date.now().toString(),
                    filename: filename,
                    type: 'application/zip',
                    data: event.target.result,
                    timestamp: new Date().getTime()
                };
                
                // Tạo transaction mới để thêm dữ liệu
                const addTransaction = this.db.transaction(['files'], 'readwrite');
                const addStore = addTransaction.objectStore('files');
                const request = addStore.add(fileData);
                
                request.onsuccess = () => {
                    console.log('Đã lưu file ZIP thành công:', fileData.id);
                    resolve(fileData.id);
                };
                request.onerror = (e) => {
                    console.error('Error storing zip file:', e.target.error);
                    reject(new Error('Không thể lưu file zip vào IndexedDB'));
                };
            };
            
            reader.onerror = (e) => {
                console.error('Error reading blob:', e);
                reject(new Error('Không thể đọc dữ liệu file'));
            };
            
            reader.readAsArrayBuffer(blob);
        });
    }

    // Get a file from the database
    async getFile(id) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const request = store.get(id);
            
            request.onsuccess = () => {
                if (!request.result) {
                    console.error('File không tồn tại:', id);
                    reject(new Error('File không tồn tại'));
                } else {
                    console.log('Đã lấy file thành công:', id);
                    resolve(request.result);
                }
            };
            
            request.onerror = (e) => {
                console.error('Error getting file:', e.target.error);
                reject(new Error('Không thể lấy file từ IndexedDB'));
            };
        });
    }

    // Delete a file from the database
    async deleteFile(id) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log('Đã xóa file:', id);
                resolve(true);
            };
            request.onerror = (e) => {
                console.error('Error deleting file:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    // Create a new task
    async createTask(type, status = 'pending') {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            
            const taskData = {
                id: Date.now().toString(),
                type: type,
                status: status,
                timestamp: new Date().getTime(),
                files: []
            };
            
            const request = store.add(taskData);
            
            request.onsuccess = () => resolve(taskData.id);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Update task status
    async updateTaskStatus(taskId, status, result = null) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.get(taskId);
            
            request.onsuccess = () => {
                const task = request.result;
                if (task) {
                    task.status = status;
                    if (result) task.result = result;
                    
                    const updateRequest = store.put(task);
                    updateRequest.onsuccess = () => resolve(true);
                    updateRequest.onerror = (e) => reject(e.target.error);
                } else {
                    reject(new Error('Task not found'));
                }
            };
            
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Get task information
    async getTask(taskId) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.get(taskId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Add a file to a task
    async addFileToTask(taskId, fileId) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.get(taskId);
            
            request.onsuccess = () => {
                const task = request.result;
                if (task) {
                    task.files.push(fileId);
                    
                    const updateRequest = store.put(task);
                    updateRequest.onsuccess = () => resolve(true);
                    updateRequest.onerror = (e) => reject(e.target.error);
                } else {
                    reject(new Error('Task not found'));
                }
            };
            
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Clean up old files (older than 1 hour)
    async cleanupOldFiles() {
        if (!this.db) await this.init();
        
        const oneHourAgo = new Date().getTime() - (60 * 60 * 1000);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const index = store.index('timestamp');
            const range = IDBKeyRange.upperBound(oneHourAgo);
            
            const request = index.openCursor(range);
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.value.id);
                    deletedCount++;
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Clean up old tasks (older than 1 hour)
    async cleanupOldTasks() {
        if (!this.db) await this.init();
        
        const oneHourAgo = new Date().getTime() - (60 * 60 * 1000);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const index = store.index('timestamp');
            const range = IDBKeyRange.upperBound(oneHourAgo);
            
            const request = index.openCursor(range);
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.value.id);
                    deletedCount++;
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

const dbManager = new IndexedDBManager();
window.dbManager = dbManager; // Make it globally accessible