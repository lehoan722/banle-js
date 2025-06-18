// grid.js – Quản lý bảng Handsontable cho in mã vạch

let hot;
let selected = [];

window.initGrid = function () {
  const container = document.getElementById('grid');
  hot = new Handsontable(container, {
    data: [],
    colHeaders: ['✓', 'Mã SP', 'Tên SP', 'SL In', 'ĐVT', 'SL', 'Giá lẻ', 'Giá nhập'],
    columns: [
      { data: 'tick', type: 'checkbox' },
      { data: 'masp', type: 'text' },
      { data: 'tensp', type: 'text' },
      { data: 'sltem', type: 'numeric' },
      { data: 'dvt', type: 'text' },
      { data: 'sl', type: 'numeric' },
      { data: 'giale', type: 'numeric', numericFormat: { pattern: '0,0' } },
      { data: 'gianhap', type: 'numeric', numericFormat: { pattern: '0,0' } }
    ],
    stretchH: 'all',
    width: '100%',
    height: 400,
    rowHeaders: true,
    manualRowMove: true,
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation'
  });
};

window.syncHandsontableToSelected = function () {
  selected = hot.getData()
    .map((row, index) => {
      const rowData = hot.getSourceDataAtRow(index);
      return {
        tick: !!rowData.tick,
        masp: (rowData.masp || '').toUpperCase(),
        tensp: rowData.tensp || '',
        sltem: parseInt(rowData.sltem) || 0,
        dvt: rowData.dvt || '',
        sl: parseFloat(rowData.sl) || 0,
        giale: parseFloat(rowData.giale) || 0,
        gianhap: parseFloat(rowData.gianhap) || 0
      };
    })
    .filter(r => r.masp);
};

window.setDataToGrid = function (data) {
  hot.loadData(data);
};
