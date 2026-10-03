// A rich-text custom field value in the same delta format Quire's own editor writes (e.g. [{"insert":"2026"}]).
export function richTextField(text) {
  return JSON.stringify([{insert: String(text)}]);
}
