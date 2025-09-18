// 複数ページ対応版のコンテンツスクリプト
console.log('🔥🔥🔥 CONTENT_MULTIPAGE.JS 読み込み完了 🔥🔥🔥');
console.log('YouTube説明欄自動編集 (複数ページ対応版): スクリプト読み込み完了');

// 古いコンテンツスクリプトが残っていないかチェック
if (window.contentScriptLoaded) {
    console.warn('⚠️ 他のコンテンツスクリプトが既に読み込まれています');
} else {
    window.contentScriptLoaded = 'content_multipage.js';
    console.log('✅ content_multipage.js が正常に設定されました');
}

// 現在のURLをチェック
const currentUrl = window.location.href;
console.log('現在のURL:', currentUrl);

// 編集ページにいる場合は自動的に説明欄を更新
if (currentUrl.includes('/video/') && currentUrl.includes('/edit')) {
    console.log('編集ページを検出しました。処理状態を確認中...');
    
    // 処理が停止されていないかチェック
    const isAutoProcessing = localStorage.getItem('yt_auto_processing') === 'true';
    if (!isAutoProcessing) {
        console.log('処理が停止されているため、説明欄の更新をスキップします');
    } else {
    
    console.log('説明欄の更新を開始します...');
    
    // ページが完全に読み込まれるまで待つ（本人確認回避のため時間を延長）
    setTimeout(async () => {
        // 再度処理状態をチェック（タイムアウト中に停止された可能性）
        const isStillProcessing = localStorage.getItem('yt_auto_processing') === 'true';
        if (!isStillProcessing) {
            console.log('処理が停止されたため、説明欄の更新をキャンセルします');
            return;
        }
        
        const result = await updateDescriptionOnEditPage();
        if (result) {
            console.log('説明欄の更新に成功しました');
            
            // 進捗を更新
            const videoUrls = JSON.parse(localStorage.getItem('yt_video_urls') || '[]');
            const currentIndex = parseInt(localStorage.getItem('yt_current_index') || '0');
            try {
                try {
                    chrome.runtime.sendMessage({
                        action: 'updateProgress',
                        progress: currentIndex + 1,
                        total: videoUrls.length
                    });
                } catch (error) {
                    console.warn('メッセージ送信エラー:', error);
                }
            } catch (error) {
                console.warn('メッセージ送信エラー:', error);
            }
            
            // 次の動画へ移動
            processNextVideo();
        } else {
            console.log('説明欄の更新に失敗しました');
        }
    }, 8000); // 3秒から8秒に延長
    }
}

// コンテンツページでページ遷移を監視
if (currentUrl.includes('studio.youtube.com') && currentUrl.includes('/videos')) {
    // ページネーション後の自動処理を確認
    const isAutoProcessing = localStorage.getItem('yt_auto_processing') === 'true';
    if (isAutoProcessing) {
        console.log('ページネーション後の自動処理を継続');
        setTimeout(() => {
            collectVideosOnCurrentPage();
        }, 3000);
    }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    if (request.action === 'startContentProcessing') {
        console.log('処理開始リクエストを受信');
        // 編集設定を保存
        chrome.storage.local.set({
            editMode: request.editMode,
            insertText: request.insertText,
            searchText: request.searchText,
            pageMode: request.pageMode,
            startPage: request.startPage,
            endPage: request.endPage,
            specificPages: request.specificPages
        });
        
        // 複数ページ処理フラグを設定
        localStorage.setItem('yt_auto_processing', 'true');
        localStorage.setItem('yt_only_public', request.onlyPublic ? 'true' : 'false');
        localStorage.removeItem('yt_video_urls');
        localStorage.removeItem('yt_current_index');
        localStorage.removeItem('yt_all_collected_urls');
        
        await collectAllPagesVideos(request.onlyPublic, request.pageMode, request.startPage, request.endPage, request.specificPages);
        sendResponse({ success: true });
    } else if (request.action === 'stopContentProcessing') {
        localStorage.removeItem('yt_video_urls');
        localStorage.removeItem('yt_current_index');
        localStorage.removeItem('yt_auto_processing');
        localStorage.removeItem('yt_all_collected_urls');
        sendResponse({ success: true });
    }
    return true;
});

// 総ページ数をページ情報から計算する関数
async function getTotalPageCount() {
    console.log('総ページ数を取得中...');
    
    await waitForPageLoad();
    
    // ページ情報を取得（例: "1～30/合計約 136"）
    const pageDescriptions = [
        '.page-description',
        '.style-scope.ytcp-table-footer .page-description',
        'span.page-description',
        'ytcp-table-footer span:contains("合計")',
        'ytcp-table-footer span:contains("total")'
    ];
    
    let pageInfo = null;
    for (const selector of pageDescriptions) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
            pageInfo = element.textContent.trim();
            console.log('ページ情報を発見:', pageInfo);
            break;
        }
    }
    
    // ページ情報が見つからない場合は、テキストで検索
    if (!pageInfo) {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
            const text = span.textContent.trim();
            if (text.includes('合計') || text.includes('total') || text.match(/\d+～\d+\/\d+/)) {
                pageInfo = text;
                console.log('テキスト検索でページ情報を発見:', pageInfo);
                break;
            }
        }
    }
    
    if (!pageInfo) {
        console.log('ページ情報が見つかりません。デフォルトで1ページとします');
        return 1;
    }
    
    // ページ情報から総動画数と1ページあたりの表示数を抽出
    // 例: "1～30/合計約 136" → 総動画数136、1ページあたり30
    let totalVideos = 0;
    let videosPerPage = 30; // デフォルト
    
    // パターン1: "1～30/合計約 136" や "1～30/136"
    const pattern1 = /(\d+)～(\d+)\/(?:合計約?\s*)?(\d+)/;
    const match1 = pageInfo.match(pattern1);
    if (match1) {
        const startNum = parseInt(match1[1]);
        const endNum = parseInt(match1[2]);
        totalVideos = parseInt(match1[3]);
        videosPerPage = endNum - startNum + 1;
    }
    
    // パターン2: "合計 136" や "total 136"
    if (!match1) {
        const pattern2 = /(?:合計|total)[\s約]*(\d+)/i;
        const match2 = pageInfo.match(pattern2);
        if (match2) {
            totalVideos = parseInt(match2[1]);
        }
    }
    
    if (totalVideos === 0) {
        console.log('総動画数を取得できませんでした。デフォルトで1ページとします');
        return 1;
    }
    
    // 総ページ数を計算
    const totalPages = Math.ceil(totalVideos / videosPerPage);
    
    console.log(`総動画数: ${totalVideos}, 1ページあたり: ${videosPerPage}, 総ページ数: ${totalPages}`);
    return totalPages;
}


// すべてのページから動画を収集
async function collectAllPagesVideos(onlyPublic, pageMode = 'all', startPage = 1, endPage = 1, specificPages = '') {
    try {
        console.log('全ページの動画収集を開始...', { pageMode, startPage, endPage, specificPages });
        let allVideoUrls = [];
        
        // 対象ページリストを作成
        let targetPages = [];
        if (pageMode === 'all') {
            targetPages = null; // 全ページ対象
        } else if (pageMode === 'range') {
            for (let i = startPage; i <= endPage; i++) {
                targetPages.push(i);
            }
        } else if (pageMode === 'specific') {
            targetPages = specificPages.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);
        }
        
        console.log('対象ページ:', targetPages);
        
        // 総ページ数を取得中であることを通知
        try {
            chrome.runtime.sendMessage({
                action: 'updatePageProgress',
                currentPage: 0,
                totalPages: 0,
                phase: 'scanning'
            });
        } catch (error) {
            console.warn('メッセージ送信エラー:', error);
        }
        
        // 総ページ数を取得
        console.log('getTotalPageCount()を呼び出します...');
        let totalPages;
        let actualTotalPages;
        try {
            actualTotalPages = await getTotalPageCount(); // 実際の総ページ数を取得
            console.log(`実際の総ページ数: ${actualTotalPages}`);
        } catch (error) {
            console.error('getTotalPageCount()でエラー:', error);
            actualTotalPages = 1; // エラー時は1ページとして扱う
        }
        
        if (pageMode === 'all') {
            totalPages = actualTotalPages;
        } else if (pageMode === 'range') {
            // 範囲が実際のページ数を超えていないかチェック
            const validEndPage = Math.min(endPage, actualTotalPages);
            totalPages = validEndPage - startPage + 1;
            console.log(`範囲指定: ${startPage}-${validEndPage} (${totalPages}ページ)`);
        } else if (pageMode === 'specific') {
            // 指定されたページが実際に存在するかチェック
            const validPages = targetPages.filter(p => p <= actualTotalPages);
            targetPages = validPages;
            totalPages = validPages.length;
            console.log(`特定ページ: ${validPages.join(',')} (${totalPages}ページ)`);
        }
        
        // 指定されたページ範囲から動画を収集
        console.log('指定されたページから動画を収集中...');
        await waitForPageLoad();
        
        // 全ページモードの場合は1ページ目のみ処理（本人確認回避）
        if (pageMode === 'all') {
            console.log('全ページモード: 1ページ目のみ処理（本人確認回避）');
            const currentPageVideos = await collectVideosOnCurrentPage(onlyPublic);
            allVideoUrls = allVideoUrls.concat(currentPageVideos);
            console.log(`1ページ目: ${currentPageVideos.length} 個の動画を収集`);
            
            // ページ進捗を更新
            try {
                chrome.runtime.sendMessage({
                    action: 'updatePageProgress',
                    currentPage: 1,
                    totalPages: actualTotalPages,
                    phase: 'collecting'
                });
            } catch (error) {
                console.warn('メッセージ送信エラー:', error);
            }
        } else {
            // 指定されたページの範囲すべてを処理
            console.log('ページ範囲指定モード:', targetPages);
            
            if (targetPages && targetPages.length > 0) {
                for (let i = 0; i < targetPages.length; i++) {
                    const pageNum = targetPages[i];
                    console.log(`ページ ${pageNum} (${i + 1}/${targetPages.length}) に移動して動画を収集します`);
                    
                    // 指定されたページに移動
                    await navigateToPage(pageNum);
                    await sleep(3000);
                    await waitForPageLoad();
                    
                    // 動画を収集
                    console.log(`ページ ${pageNum} での動画収集を開始...`);
                    const currentPageVideos = await collectVideosOnCurrentPage(onlyPublic);
                    allVideoUrls = allVideoUrls.concat(currentPageVideos);
                    console.log(`ページ ${pageNum}: ${currentPageVideos.length} 個の動画を収集 (累計: ${allVideoUrls.length}個)`);
                    
                    // ページ進捗を更新
                    try {
                        chrome.runtime.sendMessage({
                            action: 'updatePageProgress',
                            currentPage: i + 1,
                            totalPages: targetPages.length,
                            phase: 'collecting'
                        });
                    } catch (error) {
                        console.warn('メッセージ送信エラー:', error);
                    }
                }
            }
        }
        
        console.log(`全ページから合計 ${allVideoUrls.length} 個の動画を収集しました`);
        console.log('収集した動画のURL一覧:');
        allVideoUrls.forEach((video, index) => {
            console.log(`  ${index + 1}: ${video.title} -> ${video.href}`);
        });
        
        if (allVideoUrls.length === 0) {
            console.error('動画が0件のため処理を停止します');
            alert('処理する動画が見つかりませんでした');
            localStorage.removeItem('yt_auto_processing');
            return;
        }
        
        console.log('動画リストをlocalStorageに保存中...');
        
        
        // URLリストをlocalStorageに保存
        localStorage.setItem('yt_video_urls', JSON.stringify(allVideoUrls));
        localStorage.setItem('yt_current_index', '0');
        
        // 総数をバックグラウンドに送信
        try {
            try {
                chrome.runtime.sendMessage({
                    action: 'updateProgress',
                    progress: 0,
                    total: allVideoUrls.length
                });
            } catch (error) {
                console.warn('メッセージ送信エラー:', error);
            }
        } catch (error) {
            console.warn('メッセージ送信エラー:', error);
        }
        
        // 少し待ってから動画処理フェーズに切り替え（ページ進捗を一瞬表示させる）
        setTimeout(() => {
            try {
                chrome.runtime.sendMessage({
                    action: 'hidePageProgress'
                });
            } catch (error) {
                console.warn('メッセージ送信エラー:', error);
            }
        }, 1000);
        
        // 最初の動画を開く
        console.log('🎬 === 動画処理開始 ===');
        console.log(`収集動画数: ${allVideoUrls.length}`);
        
        if (allVideoUrls.length > 0) {
            const firstVideo = allVideoUrls[0];
            console.log(`最初の動画: ${firstVideo.title}`);
            console.log(`URL: ${firstVideo.href}`);
            
            // 確実に移動
            window.location.href = firstVideo.href;
            console.log('✅ 移動実行完了');
        } else {
            console.error('❌ 動画が0件です');
        }
        
    } catch (error) {
        console.error('collectAllPagesVideos エラー:', error);
        console.error('エラースタック:', error.stack);
        localStorage.removeItem('yt_auto_processing');
        
        // バックグラウンドにエラーを送信
        try {
            try {
                chrome.runtime.sendMessage({
                    action: 'error',
                    message: 'エラーが発生しました: ' + error.message
                });
            } catch (messageError) {
                console.warn('メッセージ送信エラー:', messageError);
            }
        } catch (error) {
            console.warn('メッセージ送信エラー:', error);
        }
        
        alert('エラーが発生しました: ' + error.message);
    }
}

// 現在のページの動画を収集
async function collectVideosOnCurrentPage(onlyPublic) {
    console.log('=== collectVideosOnCurrentPage 開始 ===');
    console.log('onlyPublic:', onlyPublic);
    console.log('現在のURL:', window.location.href);
    
    const videoUrls = [];
    
    // 複数のセレクタで動画行を検索
    const videoRowSelectors = [
        'ytcp-video-row',
        '[id*="video-row"]',
        '[class*="video-row"]',
        'tr[class*="video"]',
        '.video-list-item',
        'tr[class*="row"]',
        'div[class*="video"]',
        'div[role="row"]',
        '[data-video-id]',
        'tr',  // 最後の手段として全てのtr要素
        'div[class*="row"]'
    ];
    
    let videoRows = [];
    for (const selector of videoRowSelectors) {
        const rows = document.querySelectorAll(selector);
        if (rows.length > 0) {
            videoRows = rows;
            console.log(`動画行を発見: セレクタ "${selector}" で ${rows.length} 件`);
            break;
        } else {
            console.log(`動画行なし: セレクタ "${selector}"`);
        }
    }
    
    console.log('発見した動画行数:', videoRows.length);
    
    if (videoRows.length === 0) {
        // デバッグ情報: ページ内の要素を調査
        console.log('=== デバッグ情報: ページ内の要素 ===');
        const allRows = document.querySelectorAll('tr');
        console.log('全てのtr要素数:', allRows.length);
        
        const allDivs = document.querySelectorAll('div[class*="video"], div[id*="video"]');
        console.log('video関連のdiv要素数:', allDivs.length);
        
        // ページが完全に読み込まれているかチェック
        const loadingElements = document.querySelectorAll('[aria-label*="読み込み"], [aria-label*="loading"], .loading, .spinner');
        console.log('読み込み中要素数:', loadingElements.length);
        
        return videoUrls;
    }
    
    for (const row of videoRows) {
        console.log('--- 動画行を処理中 ---');
        
        // タイトルと編集リンクを取得（複数のセレクタを試行）
        const linkSelectors = [
            'a#video-title',
            'a#thumbnail-anchor', 
            'a[href*="/video/"]',
            'a[href*="watch?v="]',
            'a[href*="studio.youtube.com"]',
            'a[href*="/content/"]',
            'ytcp-video-title a',
            'div[id*="video-title"] a',
            '[aria-label*="タイトル"] a',
            'a',  // 最後の手段として全てのaタグ
        ];
        
        let editLink = null;
        let titleLink = null;
        
        for (const selector of linkSelectors) {
            const link = row.querySelector(selector);
            if (link && link.href && (
                link.href.includes('/video/') || 
                link.href.includes('watch?v=') || 
                link.href.includes('/content/') ||
                link.href.includes('studio.youtube.com')
            )) {
                editLink = link;
                if (selector === 'a#video-title' || selector === 'ytcp-video-title a') {
                    titleLink = link;
                }
                console.log(`リンク発見: ${selector} -> ${link.href}`);
                break;
            } else if (link && link.href) {
                console.log(`リンク除外: ${selector} -> ${link.href} (条件に合わず)`);
            }
        }
        
        console.log('titleLink:', titleLink ? titleLink.href : 'なし');
        console.log('editLink:', editLink ? editLink.href : 'なし');
        
        if (!editLink || !editLink.href) {
            console.log('編集リンクが見つからない');
            // デバッグ: この行にあるすべてのaタグを表示
            const allLinks = row.querySelectorAll('a');
            console.log(`この行のaタグ数: ${allLinks.length}`);
            allLinks.forEach((link, index) => {
                console.log(`  a[${index}]: ${link.href || 'href なし'}`);
            });
            continue;
        }
        
        // タイトルを取得（複数の方法を試行）
        let title = '不明';
        if (titleLink && titleLink.textContent.trim()) {
            title = titleLink.textContent.trim();
        } else if (editLink && editLink.textContent.trim()) {
            title = editLink.textContent.trim();
        } else {
            // 他のタイトル要素を検索
            const titleElements = row.querySelectorAll('#video-title, [id*="title"], [aria-label*="タイトル"]');
            for (const element of titleElements) {
                if (element.textContent.trim()) {
                    title = element.textContent.trim();
                    break;
                }
            }
        }
        const editUrl = editLink.href.includes('/edit') ? editLink.href : editLink.href + '/edit';
        
        console.log('動画タイトル:', title);
        console.log('編集URL:', editUrl);
        
        // 公開状態をチェック
        const shouldCheckPublic = onlyPublic !== undefined ? onlyPublic : localStorage.getItem('yt_only_public') === 'true';
        console.log('公開状態チェック必要:', shouldCheckPublic);
        
        if (shouldCheckPublic) {
            let isPublic = false;
            
            // 複数のセレクタで公開状態要素を検索
            const visibilitySelectors = [
                '.ytcp-video-list-cell-visibility',
                '[class*="visibility"]',
                '[class*="status"]',
                'td:nth-child(4)', // 4列目が公開状態の場合が多い
                'td:nth-child(5)', // 5列目の場合もある
                'ytcp-icon-button[icon="VISIBILITY"]', // アイコンベース
                '[data-tooltip*="公開"]',
                '[aria-label*="公開"]'
            ];
            
            let visibilityElement = null;
            let visibilityText = '';
            
            // セレクタを順番に試行
            for (const selector of visibilitySelectors) {
                const element = row.querySelector(selector);
                if (element) {
                    visibilityElement = element;
                    visibilityText = element.textContent?.trim() || '';
                    console.log(`公開状態要素発見: ${selector} -> "${visibilityText}"`);
                    break;
                }
            }
            
            if (visibilityElement && visibilityText) {
                // テキストベースの判定
                const publicKeywords = ['公開', 'Public', 'Published'];
                const privateKeywords = ['非公開', 'Private', '限定公開', 'Unlisted', 'プライベート'];
                
                const hasPublicKeyword = publicKeywords.some(keyword => visibilityText.includes(keyword));
                const hasPrivateKeyword = privateKeywords.some(keyword => visibilityText.includes(keyword));
                
                if (hasPublicKeyword && !hasPrivateKeyword) {
                    isPublic = true;
                    console.log('公開状態: 公開 (テキスト判定)');
                } else if (hasPrivateKeyword) {
                    isPublic = false;
                    console.log('公開状態: 非公開/限定公開 (テキスト判定)');
                } else {
                    // アイコンベースの判定を試行
                    const publicIcons = visibilityElement.querySelectorAll('svg, ytcp-icon');
                    if (publicIcons.length > 0) {
                        // アイコンが存在する場合は公開と仮定
                        isPublic = true;
                        console.log('公開状態: 公開 (アイコン判定)');
                    } else {
                        // 判定不可能な場合は公開と仮定（安全側）
                        isPublic = true;
                        console.log('公開状態: 判定不可のため公開と仮定');
                    }
                }
            } else {
                // 要素が見つからない場合
                console.log('公開状態要素が見つからないため詳細調査...');
                
                // 行全体から公開状態を推測
                const rowText = row.textContent || '';
                const hasPrivateIndicator = rowText.includes('非公開') || 
                                          rowText.includes('限定公開') || 
                                          rowText.includes('Private') || 
                                          rowText.includes('Unlisted');
                
                if (hasPrivateIndicator) {
                    isPublic = false;
                    console.log('公開状態: 非公開/限定公開 (行全体判定)');
                } else {
                    // デフォルトは公開と仮定
                    isPublic = true;
                    console.log('公開状態: 公開と仮定 (デフォルト)');
                }
            }
            
            if (!isPublic) {
                console.log('非公開動画のためスキップ');
                continue;
            }
        }
        
        console.log('動画を追加:', title);
        videoUrls.push({
            href: editUrl,
            title: title
        });
    }
    
    console.log(`=== 収集完了: ${videoUrls.length} 件の動画 ===`);
    return videoUrls;
}

// 指定されたページに移動する関数
async function navigateToPage(targetPage) {
    console.log(`ページ ${targetPage} に移動中...`);
    
    // 現在のページ番号を取得
    let currentPage = 1;
    const pageInfo = getCurrentPageInfo();
    if (pageInfo) {
        currentPage = pageInfo.currentPage;
    }
    
    console.log(`現在のページ: ${currentPage}, 目標ページ: ${targetPage}`);
    
    if (currentPage === targetPage) {
        console.log('既に目標ページにいます');
        return;
    }
    
    // 目標ページまで移動
    while (currentPage !== targetPage) {
        if (currentPage < targetPage) {
            // 次のページへ移動
            const nextButton = document.querySelector('#navigate-after') ||
                             document.querySelector('[aria-label="次のページに移動"]') ||
                             document.querySelector('[aria-label="次のページ"]') ||
                             document.querySelector('[aria-label="Next page"]');
            
            if (nextButton && !nextButton.disabled) {
                console.log(`ページ ${currentPage} から ${currentPage + 1} へ移動...`);
                nextButton.click();
                await sleep(3000); // ページ読み込み待機
                currentPage++;
            } else {
                console.error('次のページボタンが見つかりません');
                break;
            }
        } else {
            // 前のページへ移動
            const prevButton = document.querySelector('#navigate-before') ||
                             document.querySelector('[aria-label="前のページに移動"]') ||
                             document.querySelector('[aria-label="前のページ"]') ||
                             document.querySelector('[aria-label="Previous page"]');
            
            if (prevButton && !prevButton.disabled) {
                console.log(`ページ ${currentPage} から ${currentPage - 1} へ移動...`);
                prevButton.click();
                await sleep(3000); // ページ読み込み待機
                currentPage--;
            } else {
                console.error('前のページボタンが見つかりません');
                break;
            }
        }
    }
    
    console.log(`ページ ${targetPage} への移動完了`);
}

// 現在のページ情報を取得する関数
function getCurrentPageInfo() {
    // ページ情報を取得（例: "1～30/合計約 136"）
    const pageDescriptions = [
        '.page-description',
        '.style-scope.ytcp-table-footer .page-description',
        'span.page-description'
    ];
    
    for (const selector of pageDescriptions) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
            const pageInfo = element.textContent.trim();
            const pattern = /(\d+)～(\d+)\/(?:合計約?\s*)?(\d+)/;
            const match = pageInfo.match(pattern);
            if (match) {
                const startNum = parseInt(match[1]);
                const endNum = parseInt(match[2]);
                const totalVideos = parseInt(match[3]);
                const videosPerPage = endNum - startNum + 1;
                const currentPage = Math.ceil(startNum / videosPerPage);
                return {
                    currentPage: currentPage,
                    startNum: startNum,
                    endNum: endNum,
                    totalVideos: totalVideos,
                    videosPerPage: videosPerPage
                };
            }
        }
    }
    return null;
}

// ページの読み込みを待つ
async function waitForPageLoad() {
    console.log('waitForPageLoad: ページの読み込みを待機中...');
    let attempts = 0;
    const maxAttempts = 60; // 30秒に延長
    
    while (attempts < maxAttempts) {
        // 複数のセレクタで動画行を検索
        const videoRowSelectors = [
            'ytcp-video-row',
            '[id*="video-row"]',
            '[class*="video-row"]',
            'tr[class*="video"]',
            '.video-list-item',
            'tr[class*="row"]',
            'div[class*="video"]',
            'div[role="row"]',
            '[data-video-id]',
            'tr'  // 最後の手段として全てのtr要素
        ];
        
        let videoRows = [];
        for (const selector of videoRowSelectors) {
            const rows = document.querySelectorAll(selector);
            if (rows.length > 0) {
                videoRows = rows;
                break;
            }
        }
        
        console.log(`waitForPageLoad: 試行 ${attempts + 1}/${maxAttempts}, 動画行数: ${videoRows.length}`);
        
        if (videoRows.length > 0) {
            console.log('waitForPageLoad: 動画リストが見つかりました');
            await sleep(1000);
            return;
        }
        
        // 現在のURLをログ出力
        if (attempts % 10 === 0) {
            console.log('waitForPageLoad: 現在のURL:', window.location.href);
            // ページの状態をチェック
            const loadingIndicators = document.querySelectorAll('[aria-label*="読み込み"], [aria-label*="loading"], .loading, .spinner');
            console.log('waitForPageLoad: 読み込み中インジケータ数:', loadingIndicators.length);
        }
        
        await sleep(500);
        attempts++;
    }
    
    console.error('waitForPageLoad: タイムアウト - 動画リストが見つかりませんでした');
    console.error('waitForPageLoad: 現在のURL:', window.location.href);
    console.error('waitForPageLoad: ページのHTML:', document.documentElement.outerHTML.substring(0, 1000));
    throw new Error('[CONTENT_MULTIPAGE.JS] 動画リストの読み込みがタイムアウトしました');
}

// 次の動画を処理
function processNextVideo() {
    // 処理が停止されていないかチェック
    const isAutoProcessing = localStorage.getItem('yt_auto_processing') === 'true';
    if (!isAutoProcessing) {
        console.log('処理が停止されているため、次の動画への移動をキャンセルします');
        return;
    }
    
    const videoUrls = JSON.parse(localStorage.getItem('yt_video_urls') || '[]');
    const currentIndex = parseInt(localStorage.getItem('yt_current_index') || '0');
    
    console.log(`処理状況: ${currentIndex + 1}/${videoUrls.length}`);
    
    if (currentIndex + 1 < videoUrls.length) {
        // 次の動画がある
        const nextIndex = currentIndex + 1;
        const nextVideo = videoUrls[nextIndex];
        console.log(`次の動画へ移動 (${nextIndex + 1}/${videoUrls.length}): ${nextVideo.title}`);
        
        localStorage.setItem('yt_current_index', nextIndex.toString());
        
        // 動画処理フェーズではページ進捗は更新しない（動画進捗のみ）
        
        setTimeout(() => {
            // 移動前に再度処理状態をチェック
            const isStillProcessing = localStorage.getItem('yt_auto_processing') === 'true';
            if (!isStillProcessing) {
                console.log('処理が停止されたため、次の動画への移動をキャンセルします');
                return;
            }
            window.location.href = nextVideo.href;
        }, 10000); // 3秒から10秒に延長（本人確認回避）
    } else {
        // すべて完了
        console.log('すべての動画の処理が完了しました');
        const processedCount = videoUrls.length;
        alert(`${processedCount}個の動画の説明欄を更新しました！`);
        
        // localStorageをクリア
        localStorage.removeItem('yt_video_urls');
        localStorage.removeItem('yt_current_index');
        localStorage.removeItem('yt_auto_processing');
        localStorage.removeItem('yt_all_collected_urls');
        
        // 完了通知を送信
        try {
            try {
                chrome.runtime.sendMessage({
                    action: 'processingComplete'
                });
            } catch (error) {
                console.warn('メッセージ送信エラー:', error);
            }
        } catch (error) {
            console.warn('メッセージ送信エラー:', error);
        }
        
        // コンテンツページに戻る
        setTimeout(() => {
            window.location.href = 'https://studio.youtube.com/channel/UC/videos/upload';
        }, 3000);
    }
}

// 説明欄の更新（既存の関数と同じ）
async function updateDescriptionOnEditPage() {
    try {
        console.log('説明欄を探しています...');
        
        let descriptionField = null;
        let attempts = 0;
        const maxAttempts = 30;
        
        while (!descriptionField && attempts < maxAttempts) {
            // 様々なセレクタを試す
            const selectors = [
                '#description-container #textbox',
                '#description #textbox',
                'div[slot="description"] #textbox',
                '#textbox[contenteditable="true"]',
                'div[aria-label*="説明"]',
                'div[aria-label*="Description"]',
                '.description-field #textbox',
                '#description-textbox',
                'ytcp-mention-textbox#description #textbox',
                'ytcp-mention-input#description-container #textbox'
            ];
            
            for (const selector of selectors) {
                descriptionField = document.querySelector(selector);
                if (descriptionField) {
                    console.log('説明欄を発見:', selector);
                    break;
                }
            }
            
            if (!descriptionField) {
                // contenteditable要素を探す
                const editableElements = document.querySelectorAll('[contenteditable="true"]');
                for (const elem of editableElements) {
                    // 説明欄らしき要素を探す
                    const parent = elem.closest('[id*="description"], [aria-label*="説明"], [slot="description"]');
                    if (parent) {
                        descriptionField = elem;
                        console.log('説明欄を発見 (contenteditable)');
                        break;
                    }
                }
            }
            
            if (!descriptionField) {
                await sleep(1000);
                attempts++;
                console.log(`説明欄を探しています... (${attempts}/${maxAttempts})`);
            }
        }
        
        if (!descriptionField) {
            console.error('説明欄が見つかりませんでした');
            return false;
        }
        
        // 編集設定を取得
        const editSettings = await new Promise(resolve => {
            chrome.storage.local.get(['editMode', 'insertText', 'searchText'], resolve);
        });
        
        const editMode = editSettings.editMode || 'prepend';
        const insertText = editSettings.insertText || '';
        const searchText = editSettings.searchText || '';
        
        // 現在の説明文を取得
        const currentDescription = descriptionField.textContent || descriptionField.innerText || '';
        console.log('現在の説明文の長さ:', currentDescription.length);
        console.log('編集モード:', editMode);
        
        // 新しい説明文を生成
        let newDescription = currentDescription;
        
        switch(editMode) {
            case 'prepend': // 先頭に追加
                if (currentDescription.includes(insertText)) {
                    console.log('既に文言が挿入されています');
                    return true;
                }
                newDescription = insertText + '\n\n' + currentDescription;
                break;
                
            case 'append': // 末尾に追加
                if (currentDescription.includes(insertText)) {
                    console.log('既に文言が挿入されています');
                    return true;
                }
                newDescription = currentDescription + '\n\n' + insertText;
                break;
                
            case 'replace': // 置換
                if (!currentDescription.includes(searchText)) {
                    console.log('置換対象の文字列が見つかりません');
                    return true;
                }
                newDescription = currentDescription.replaceAll(searchText, insertText);
                console.log(`置換実行: "${searchText}" → "${insertText}"`);
                break;
                
            case 'delete': // 削除
                if (!currentDescription.includes(searchText)) {
                    console.log('削除対象の文字列が見つかりません');
                    return true;
                }
                newDescription = currentDescription.replaceAll(searchText, '');
                console.log(`削除実行: "${searchText}"`);
                break;
        }
        
        // 変更がない場合はスキップ
        if (newDescription === currentDescription) {
            console.log('変更なし');
            return true;
        }
        
        // 説明欄をクリックしてフォーカス（本人確認回避のため間隔を延長）
        descriptionField.click();
        await sleep(1500); // 500ms → 1500ms
        descriptionField.focus();
        await sleep(1500); // 500ms → 1500ms
        
        // 全選択（本人確認回避のため間隔を延長）
        const range = document.createRange();
        range.selectNodeContents(descriptionField);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        await sleep(1000); // 200ms → 1000ms
        
        // 新しいテキストを挿入
        document.execCommand('insertText', false, newDescription);
        
        // イベントを発火
        descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
        descriptionField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        
        console.log('説明欄を更新しました');
        await sleep(4000); // 2秒から4秒に延長
        
        // 保存ボタンを探す
        const saveSelectors = [
            '#done-button',
            '#save',
            '#save-button',
            'ytcp-button#done-button',
            'ytcp-button[id*="save"]',
            'button[aria-label*="保存"]',
            'button[aria-label*="Save"]',
            'ytcp-button[aria-label*="保存"]',
            'ytcp-button[aria-label*="動画を保存"]'
        ];
        
        let saveButton = null;
        for (const selector of saveSelectors) {
            saveButton = document.querySelector(selector);
            if (saveButton && !saveButton.disabled) {
                console.log('保存ボタンを発見:', selector);
                break;
            }
        }
        
        if (saveButton) {
            console.log('保存ボタンをクリック');
            saveButton.click();
            await sleep(6000); // 3秒から6秒に延長
            return true;
        } else {
            console.log('保存ボタンが見つかりません - 手動で保存してください');
            return true;
        }
        
    } catch (error) {
        console.error('更新中にエラー:', error);
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}