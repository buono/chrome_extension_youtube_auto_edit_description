let processingTabId = null;

chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    if (request.action === 'startProcessing') {
        processingTabId = request.tabId;
        
        chrome.storage.local.set({
            isProcessing: true,
            progress: 0,
            total: 0
        });
        
        chrome.tabs.sendMessage(processingTabId, {
            action: 'startContentProcessing',
            onlyPublic: request.onlyPublic,
            editMode: request.editMode,
            insertText: request.insertText,
            searchText: request.searchText,
            pageMode: request.pageMode,
            startPage: request.startPage,
            endPage: request.endPage,
            specificPages: request.specificPages
        });
        
        sendResponse({ success: true });
        
    } else if (request.action === 'stopProcessing') {
        if (processingTabId) {
            chrome.tabs.sendMessage(processingTabId, {
                action: 'stopContentProcessing'
            });
        }
        
        chrome.storage.local.set({
            isProcessing: false
        });
        
        sendResponse({ success: true });
        
    } else if (request.action === 'updateProgress') {
        chrome.storage.local.set({
            progress: request.progress,
            total: request.total
        });
        
        chrome.runtime.sendMessage({
            action: 'updateProgress',
            progress: request.progress,
            total: request.total
        });
        
    } else if (request.action === 'updatePageProgress') {
        chrome.runtime.sendMessage({
            action: 'updatePageProgress',
            currentPage: request.currentPage,
            totalPages: request.totalPages,
            phase: request.phase
        });
        
    } else if (request.action === 'hidePageProgress') {
        chrome.runtime.sendMessage({
            action: 'hidePageProgress'
        });
        
    } else if (request.action === 'processingComplete') {
        chrome.storage.local.set({
            isProcessing: false
        });
        
        chrome.runtime.sendMessage({
            action: 'processingComplete'
        });
        
        processingTabId = null;
        
    } else if (request.action === 'processingStopped') {
        chrome.storage.local.set({
            isProcessing: false
        });
        
        chrome.runtime.sendMessage({
            action: 'processingStopped'
        });
        
        processingTabId = null;
        
    } else if (request.action === 'error') {
        chrome.storage.local.set({
            isProcessing: false
        });
        
        chrome.runtime.sendMessage({
            action: 'error',
            message: request.message
        });
        
        processingTabId = null;
    }
    
    return true;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
    if (tabId === processingTabId) {
        chrome.storage.local.set({
            isProcessing: false
        });
        processingTabId = null;
    }
});

chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.local.set({
        isProcessing: false,
        progress: 0,
        total: 0
    });
});