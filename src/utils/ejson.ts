export function isEJSON(obj) {
  return typeof obj === 'object'
    && obj !== null
    && Object
      .keys(obj)
      .some((key) => {
        if (key.startsWith('$')) return true;
        return typeof obj[key] === 'object' && obj[key] !== null && isEJSON(obj[key]);
      });
}
