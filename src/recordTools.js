export function printableValue(v){
  if(v===null||v===undefined||v==='') return '—';
  if(Array.isArray(v)) return v.map(printableValue).join(', ');
  if(typeof v==='object') return Object.entries(v).map(([k,x])=>`${k}: ${printableValue(x)}`).join(' | ');
  return String(v);
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
export function printRecords(title,records,columns){
  const rows=(records||[]).map(r=>`<tr>${columns.map(c=>`<td>${escapeHtml(printableValue(typeof c.value==='function'?c.value(r):r[c.key]))}</td>`).join('')}</tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:6px;vertical-align:top;text-align:left}th{background:#f0f4ed}.meta{font-size:11px;color:#666;margin-bottom:12px}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">Generado: ${new Date().toLocaleString('es-MX')} · ${records.length} registro(s)</div><table><thead><tr>${columns.map(c=>`<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print();}</script></body></html>`;
  const w=window.open('','_blank','width=1100,height=800');
  if(!w){alert('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para NODO.');return;}
  w.document.open();w.document.write(html);w.document.close();
}
export function toggleSelection(selected,id){
  const next=new Set(selected); if(next.has(id))next.delete(id); else next.add(id); return next;
}
export function selectAll(ids){return new Set(ids);}
