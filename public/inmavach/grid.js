// grid.js
import Handsontable from 'https://cdn.jsdelivr.net/npm/handsontable@14.1.0/+esm';

let hot;
export let selected = [];

export function initGrid(containerId = 'hot') {
    const container = document.getElementById(containerId);
    hot = new Handsontable(container, {
        data: [],
        rowHeaders: true,
        colHeaders: ['Mã SP', 'Tên SP', 'Số lượng tem', 'Giá lẻ', 'Tick'],
        columns: [
            { data: 'masp' },
            { data: 'tensp' },
            { data: 'sltem', type: 'numeric' },
            { data: 'giale', type: 'numeric', numericFormat: { pattern: '0,0' } },
            { data: 'tick', type: 'checkbox' },
        ],
        licenseKey: 'non-commercial-and-evaluation',
        width: '100%',
        height: 400,
        stretchH: 'all',
    });
}

export function loadData(data) {
    if (hot) hot.loadData(data);
}

export function syncGridToSelected() {
    if (!hot) return;
    selected = hot.getData().filter(row => row[4]);
}

export function getSelectedRows() {
    return selected;
}
