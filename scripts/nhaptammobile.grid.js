// public/scripts/nhaptammobile.grid.js
;(() => {
  const SIZES = [0,38,39,40,41,42,43,44,45]
  const $tbody = () => document.querySelector('#tblKQ tbody')

  // state: { [masp]: { qty: {size:number}, vitri:'', ton1:0, ton2:0 } }
  const state = {}

  function setRow(masp, patch){
    if(!state[masp]) state[masp] = { qty:{}, vitri:'', ton1:0, ton2:0 }
    const row = state[masp]
    if(patch.qty){
      for(const k of Object.keys(patch.qty)){
        row.qty[k] = (row.qty[k]||0) + patch.qty[k]
        if(row.qty[k] <= 0) delete row.qty[k]
      }
    }
    if(patch.vitri !== undefined) row.vitri = patch.vitri
    if(patch.ton1  !== undefined) row.ton1  = patch.ton1
    if(patch.ton2  !== undefined) row.ton2  = patch.ton2
    render()
  }

  function replaceState(next){
    // used by Undo
    for(const k of Object.keys(state)) delete state[k]
    for(const [masp,val] of Object.entries(next)) state[masp] = JSON.parse(JSON.stringify(val))
    render()
  }

  function getState(){ return JSON.parse(JSON.stringify(state)) }

  function calcTong(row){
    return SIZES.reduce((s,sz)=> s + (row.qty[sz]||0), 0)
  }

  function render(){
    const tb = $tbody()
    tb.innerHTML = ''
    const entries = Object.entries(state)
    entries.forEach(([masp,row])=>{
      const tr = document.createElement('tr')
      const tong = calcTong(row)
      tr.innerHTML = [
        `<td class="locked" style="text-align:left">${masp}</td>`,
        ...SIZES.map(sz=>`<td data-masp="${masp}" data-size="${sz}" contenteditable="true">${row.qty[sz]||0}</td>`),
        `<td class="locked">${tong}</td>`,
        `<td class="locked">${row.vitri||''}</td>`,
        `<td class="locked">${row.ton1??''}</td>`,
        `<td class="locked">${row.ton2??''}</td>`
      ].join('')
      tb.appendChild(tr)
    })
    hookEditCells()
    window.NTMobile.onGridChanged && window.NTMobile.onGridChanged()
  }

  function hookEditCells(){
    $tbody().querySelectorAll('td[contenteditable="true"]').forEach(td=>{
      td.addEventListener('blur', onEdit)
      td.addEventListener('keydown', e=>{
        if(e.key === 'Enter'){ e.preventDefault(); td.blur() }
      })
    })
  }
  function onEdit(e){
    const td = e.currentTarget
    const masp = td.dataset.masp
    const size = +td.dataset.size
    const v = td.textContent.trim()
    const num = v==='' ? 0 : Math.max(0, parseInt(v,10) || 0)
    state[masp].qty[size] = num
    if(num===0) delete state[masp].qty[size]
    render()
  }

  function computeTotals(){
    const mats = Object.keys(state)
    const tongMH = mats.length
    const tongSL = mats.reduce((s,m)=> s + calcTong(state[m]), 0)
    return {tongMH, tongSL}
  }

  function markViolations(cells){ // cells: [{masp,size}]
    // clear
    $tbody().querySelectorAll('td').forEach(td=>td.classList.remove('err'))
    cells.forEach(({masp,size})=>{
      const td = $tbody().querySelector(`td[data-masp="${masp}"][data-size="${size}"]`)
      if(td) td.classList.add('err')
    })
  }

  window.NTGrid = { setRow, getState, replaceState, computeTotals, markViolations }
})()
