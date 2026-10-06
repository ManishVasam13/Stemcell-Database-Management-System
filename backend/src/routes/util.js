/** empty strings from forms become NULL */
const nz = (v) => (v === undefined || v === '' ? null : v);

/** six HLA values in column order, or six NULLs */
const hlaValues = (b = {}) => ['hla_a_1', 'hla_a_2', 'hla_b_1', 'hla_b_2', 'hla_drb1_1', 'hla_drb1_2'].map((k) => nz(b[k]));

const toInt = (v, d = null) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

module.exports = { nz, hlaValues, toInt };
