const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class AutoPreviewProvider {

    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
    }

    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
     * @param {vscode.CancellationToken} token
     */
    async resolveCustomTextEditor(document, webviewPanel, token) {
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        const updateWebview = async () => {
            const text = document.getText();
            let autoData = {};
            try {
                autoData = JSON.parse(text);
            } catch (e) {
                // ignore
            }

            // Collect all path names referenced in the auto
            const pathNames = new Set();
            const collectPaths = (cmd) => {
                if (!cmd) return;
                if (cmd.type === 'path' && cmd.data && cmd.data.pathName) {
                    pathNames.add(cmd.data.pathName);
                }
                if (cmd.data && cmd.data.commands) {
                    cmd.data.commands.forEach(collectPaths);
                }
            };
            if (autoData.command) collectPaths(autoData.command);

            // Load content for each path
            const paths = {};
            if (pathNames.size > 0) {
                // Strategy: Look for .path files in the workspace
                // We assume they are unique by name or we take the first one found
                const allPathFiles = await vscode.workspace.findFiles('**/*.path');
                
                for (const name of pathNames) {
                    const foundUri = allPathFiles.find(uri => {
                        const baseName = path.basename(uri.fsPath, '.path');
                        return baseName === name;
                    });

                    if (foundUri) {
                        try {
                            const fileData = await vscode.workspace.fs.readFile(foundUri);
                            const jsonString = new TextDecoder().decode(fileData);
                            paths[name] = JSON.parse(jsonString);
                        } catch (err) {
                            console.error(`Failed to load path ${name}`, err);
                        }
                    }
                }
            }
            
            webviewPanel.webview.postMessage({
                type: 'update',
                text: text,
                paths: paths
            });
        };

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        updateWebview();
    }

    /**
     * @param {vscode.Webview} webview
     */
    getHtmlForWebview(webview) {
        const htmlPath = path.join(this.context.extensionPath, 'src', 'webviews', 'autoPreview.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Get path to the field image
        const fieldImagePath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'src', 'webviews', 'media', 'Field_26.png')
        );
        const fieldImageUri = webview.asWebviewUri(fieldImagePath);

        // Replace placeholder in HTML with actual URI
        htmlContent = htmlContent.replace('${fieldImageUri}', fieldImageUri.toString());
        
        return htmlContent;
    }
}

module.exports = AutoPreviewProvider;
