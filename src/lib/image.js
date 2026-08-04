// Compressão de fotografias antes de as enviar para uma Edge Function de
// análise por IA (Gemini). Reduz o tamanho do pedido e normaliza o formato
// para JPEG — sem isto, um print direto da câmara/telemóvel pode vir em HEIC
// ou pesar vários MB.
//
// minWidth/maxHeight existem por causa dos "screenshots em scroll" (ex.:
// Garmin/Strava exportados como uma imagem muito alta e estreita): escalar só
// pelo lado maior deixava-os com uma largura ilegível (~150px). O minWidth
// impõe um piso de largura; o maxHeight evita que essa correção dispare uma
// altura desproporcional para o lado oposto.
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      img.onerror = reject;
      img.onload = () => {
        const maxSide = 1600;
        const minWidth = 900;
        const maxHeight = 6000;
        let scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (img.width * scale < minWidth) scale = Math.min(1, minWidth / img.width);
        if (img.height * scale > maxHeight) scale = maxHeight / img.height;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        // base64 sem o prefixo "data:image/jpeg;base64," — é o que as Edge
        // Functions de análise (analyze-run, analyze-meal, ...) esperam.
        resolve({ dataUrl, base64: dataUrl.split(',')[1] });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
