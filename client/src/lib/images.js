// Listing media helpers shared by the Post page and the admin editor.

// Uploads travel as base64 inside a 30 MB request, and base64 adds ~33%.
export const MAX_VIDEO_MB = 20;

// Photos are stored in the database, so shrink them in the browser first:
// a 5 MB phone photo becomes ~250 KB at 1600px.
export const compressImage = file => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(img.src);
    resolve(canvas.toDataURL("image/jpeg", 0.8));
  };
  img.onerror = reject;
  img.src = URL.createObjectURL(file);
});

export const readAsDataURL = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
