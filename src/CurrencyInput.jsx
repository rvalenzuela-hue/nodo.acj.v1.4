import React,{useEffect,useState} from 'react';

export function parseCurrency(value){
  let s=String(value??'').trim().replace(/[$\s]/g,'');
  if(!s)return '';
  s=s.replace(/[^0-9,.-]/g,'');
  const neg=s.startsWith('-'); s=s.replace(/-/g,'');
  const commas=(s.match(/,/g)||[]).length, dots=(s.match(/\./g)||[]).length;
  let normalized=s;
  if(commas&&dots){
    const lastComma=s.lastIndexOf(','),lastDot=s.lastIndexOf('.');
    const decimalSep=lastComma>lastDot?',':'.',thousandSep=decimalSep===','?'.':',';
    normalized=s.split(thousandSep).join('').replace(decimalSep,'.');
  }else if(commas){
    const parts=s.split(',');
    if(parts.length===2&&parts[1].length>0&&parts[1].length<=2) normalized=parts[0]+'.'+parts[1];
    else normalized=parts.join('');
  }else if(dots){
    const parts=s.split('.');
    if(parts.length===2&&parts[1].length===3) normalized=parts.join('');
    else if(parts.length>2) normalized=parts.join('');
  }
  const n=Number(normalized);
  return Number.isFinite(n)?String(neg?-n:n):'';
}
export function formatCurrency(value,currency='MXN'){
  if(value===''||value===null||value===undefined)return '';
  const n=Number(value); if(!Number.isFinite(n))return '';
  return n.toLocaleString('es-MX',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2});
}
export default function CurrencyInput({value,onChange,style,currency='MXN',placeholder,disabled=false}){
  const [text,setText]=useState(()=>formatCurrency(value,currency));
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setText(formatCurrency(value,currency))},[value,currency,focused]);
  return <input inputMode="decimal" disabled={disabled} style={style} placeholder={placeholder||formatCurrency(0,currency)}
    value={focused?text:formatCurrency(value,currency)}
    onFocus={()=>{setFocused(true);setText(value===''?'':String(value))}}
    onChange={e=>{setText(e.target.value);const parsed=parseCurrency(e.target.value);if(parsed!==''||e.target.value.trim()==='')onChange(parsed)}}
    onBlur={()=>{setFocused(false);const parsed=parseCurrency(text);onChange(parsed);setText(formatCurrency(parsed,currency))}}/>;
}
