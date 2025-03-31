// File processor for handling client-side file operations
class FileProcessor {
    constructor() {
        this.dbManager = null;
    }

    // Initialize the processor
    async init() {
        try {
            // Khởi tạo IndexedDB manager
            this.dbManager = new IndexedDBManager();
            await this.dbManager.init();
            
            // Cleanup old files and tasks
            await this.dbManager.cleanupOldFiles();
            await this.dbManager.cleanupOldTasks();
            
            return true;
        } catch (error) {
            console.error('Error initializing FileProcessor:', error);
            return false;
        }
    }

    // Process the response from the server
    async processServerResponse(response) {
        try {
            if (!response) {
                throw new Error('Không nhận được phản hồi từ máy chủ');
            }

            if (response.error) {
                throw new Error(response.error);
            }

            // Kiểm tra các trường hợp phản hồi khác nhau
            let fileData = null;
            let filename = null;

            // Trường hợp 1: Phản hồi có zip_data
            if (response.zip_data) {
                console.log('Nhận được dữ liệu ZIP từ server');
                fileData = response.zip_data;
                filename = response.filename || 'processed_files.zip';
            }
            // Trường hợp 2: Phản hồi có file_data
            else if (response.file_data) {
                fileData = response.file_data;
                filename = response.filename || 'processed_file';
            }
            // Trường hợp 3: Phản hồi có output_files
            else if (response.output_files && response.output_files.length > 0) {
                fileData = response.output_files[0];
                filename = response.output_files[0];
            }
            else {
                throw new Error('Không tìm thấy dữ liệu file trong phản hồi từ máy chủ');
            }

            // Chuyển đổi dữ liệu thành blob
            let blob;
            if (typeof fileData === 'string') {
                try {
                    console.log('Đang giải mã dữ liệu base64...');
                    // Thử giải mã base64
                    const binaryString = atob(fileData);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    blob = new Blob([bytes], { type: 'application/zip' });
                    console.log('Đã tạo blob từ dữ liệu base64');
                } catch (e) {
                    console.error('Lỗi khi giải mã base64:', e);
                    throw new Error('Không thể giải mã dữ liệu file');
                }
            } else if (fileData instanceof Blob) {
                blob = fileData;
            } else {
                throw new Error('Định dạng dữ liệu file không hợp lệ');
            }
            
            // Lưu file vào IndexedDB
            console.log('Đang lưu file vào IndexedDB...');
            const fileId = await this.dbManager.storeZipFile(blob, filename);
            
            if (!fileId) {
                throw new Error('Không thể lưu file vào IndexedDB');
            }
            
            console.log('Đã lưu file thành công với ID:', fileId);
            
            // Trả về kết quả
            return {
                success: true,
                message: response.message || 'Xử lý thành công',
                fileId: fileId,
                filename: filename,
                processed_files: response.processed_files,
                failed_files: response.failed_files
            };
        } catch (error) {
            console.error('Error processing server response:', error);
            return {
                success: false,
                error: error.message || 'Lỗi xử lý phản hồi từ máy chủ'
            };
        }
    }

    // Download a file from IndexedDB
    async downloadFile(fileId, filename) {
        try {
            if (!fileId) {
                throw new Error('ID file không hợp lệ');
            }

            console.log('Đang lấy file từ IndexedDB:', fileId);
            // Get the file from IndexedDB
            const fileData = await this.dbManager.getFile(fileId);
            if (!fileData) {
                throw new Error('File không tồn tại hoặc đã hết hạn');
            }
            
            if (!fileData.data) {
                throw new Error('Dữ liệu file không hợp lệ');
            }
            
            console.log('Đã lấy file thành công, đang tạo blob...');
            // Create a blob from the file data
            const blob = new Blob([fileData.data], { type: fileData.type });
            
            // Create a download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || fileData.filename;
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                // Delete the file from IndexedDB after download
                this.dbManager.deleteFile(fileId);
            }, 100);
            
            return true;
        } catch (error) {
            console.error('Error downloading file:', error);
            Swal.fire({
                icon: 'error',
                title: 'Lỗi!',
                text: error.message || 'Không thể tải file'
            });
            return false;
        }
    }

    // Check task status
    async checkTaskStatus(taskId) {
        try {
            const task = await this.dbManager.getTask(taskId);
            if (!task) {
                throw new Error('Task không tồn tại');
            }
            return task;
        } catch (error) {
            console.error('Error checking task status:', error);
            return null;
        }
    }

    // Process multiple files
    async processMultipleFiles(files) {
        try {
            const taskId = await this.dbManager.createTask('batch_upload');
            const results = [];

            for (const file of files) {
                const result = await this.processFileUpload(file);
                if (result.success) {
                    results.push(result);
                }
            }

            await this.dbManager.updateTaskStatus(taskId, 'completed', results);
            return {
                success: true,
                taskId: taskId,
                results: results
            };
        } catch (error) {
            console.error('Error processing multiple files:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Process file upload
    async processFileUpload(file) {
        try {
            // Create a new task
            const taskId = await this.dbManager.createTask('upload');
            
            // Store the file in IndexedDB
            const fileId = await this.dbManager.storeFile(file, file.name, file.type);
            
            // Add the file to the task
            await this.dbManager.addFileToTask(taskId, fileId);
            
            // Update task status
            await this.dbManager.updateTaskStatus(taskId, 'completed');
            
            return {
                success: true,
                taskId: taskId,
                fileId: fileId
            };
        } catch (error) {
            console.error('Error processing file upload:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create and export a singleton instance
const fileProcessor = new FileProcessor();

// Initialize the processor when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const initialized = await fileProcessor.init();
        if (initialized) {
            window.fileProcessor = fileProcessor;
        } else {
            console.error('Failed to initialize FileProcessor');
        }
    } catch (error) {
        console.error('Error during FileProcessor initialization:', error);
    }
});