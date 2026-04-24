import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// Importa tu cliente de API de IA aquí (ej. OpenAI, Replicate)

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('agent.generateImage', async () => {
        // 1. Pedir prompt al usuario
        const prompt = await vscode.window.showInputBox({
            prompt: "Describe la imagen que deseas generar",
            placeHolder: "Un gato futurista estilo cyberpunk..."
        });

        if (!prompt) return;

        vscode.window.showInformationMessage(`Generando: ${prompt}`);

        try {
            // 2. Llamada a la API de Imágenes (Simulada)
            // const imageBase64 = await callImageApi(prompt);
            const imageBase64 = "data:image/png;base64,..."; // Resultado real

            // 3. Guardar imagen en el espacio de trabajo
            const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (wsPath) {
                const filePath = path.join(wsPath, `generated-${Date.now()}.png`);
                // fs.writeFileSync(filePath, Buffer.from(imageBase64, 'base64'));
                
                vscode.window.showInformationMessage(`Imagen guardada en: ${filePath}`);
                
                // 4. Opcional: Abrir la imagen automáticamente
                // vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
