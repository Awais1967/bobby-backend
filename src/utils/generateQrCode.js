const QRCode = require("qrcode");

async function generateQrCode(text) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
}

module.exports = generateQrCode;
