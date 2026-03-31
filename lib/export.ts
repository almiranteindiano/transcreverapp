import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

export const exportToPDF = (title: string, content: string) => {
  const doc = new jsPDF();
  const splitText = doc.splitTextToSize(content, 180);
  doc.text(title, 10, 10);
  doc.text(splitText, 10, 20);
  doc.save(`${title}.pdf`);
};

export const exportToWord = async (title: string, content: string) => {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 32,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: content,
                size: 24,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title}.docx`);
};

export const exportToTXT = (title: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${title}.txt`);
};
