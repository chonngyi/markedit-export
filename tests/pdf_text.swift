import Foundation
import AppKit
import PDFKit
let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
let page = document.page(at: 0)!
let bounds = page.bounds(for: .mediaBox)
var fonts = Set<String>()
for i in 0..<document.pageCount {
 if let text = document.page(at: i)?.attributedString {
  text.enumerateAttribute(.font, in: NSRange(location: 0, length: text.length)) { value, _, _ in
   if let font = value as? NSFont { fonts.insert(font.fontName) }
  }
 }
}
let result: [String: Any] = ["fonts": Array(fonts), "pages": document.pageCount, "width": bounds.width, "height": bounds.height, "text": document.string ?? ""]
let data = try JSONSerialization.data(withJSONObject: result)
print(String(data: data, encoding: .utf8)!)
