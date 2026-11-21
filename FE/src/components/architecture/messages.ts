import { defineMessages } from '@/i18n/define';

// Texts of the architecture workspace and its diagram pieces (toolbar, layers, issues, details, quality, AI model).
// One set for the area: these components ship in the same chunk as the workspace page.

export const ARCH = defineMessages({
  // Toolbar
  tools: 'Diagram tools', find: 'Find…  /', findNode: 'Find a node',
  direct: 'Direct', directNeighbours: 'Direct neighbours', usedBy: 'Used by', usedByAll: 'Used by (everything that depends on it)', dependsOn: 'Depends on', dependsOnAll: 'Depends on (everything it needs)',
  reach: 'Dependency reach', route: 'Dependency route', routeFrom: 'Route from', routeTo: 'Route to', from: 'From', to: 'To', routeHint: 'Highlights how the first depends on the second.', routeTool: 'Route between two nodes',
  showRoles: 'Show roles', roleLens: 'Role lens', allRoles: 'All roles', filterRole: 'Filter by role',
  zoomOut: 'Zoom out', zoomIn: 'Zoom in', zoomInKey: 'Zoom in  (+)', zoomOutKey: 'Zoom out  (-)', fit: 'Fit diagram', fitKey: 'Fit diagram  (0)', zoomSel: 'Zoom to selection', zoomSelKey: 'Zoom to selection  (F)', zoomLevel: 'Zoom {pct}%, choose a level',
  counts: 'Dependency counts', countsAll: 'Dependency counts on all arrows', lightTheme: 'Light theme', darkTheme: 'Dark theme', minimap: 'Minimap', layersPanel: 'Layers panel', detailsPanel: 'Details panel',
  export: 'Export', svg: 'SVG image', png: 'PNG image', html: 'Standalone HTML', json: 'Data (JSON)', fullScreen: 'Full screen', exitFullScreen: 'Exit full screen', keyboard: 'Keyboard and mouse', keyboardKey: 'Keyboard and mouse  ?', more: 'More',
  // Layers and snapshots
  layers: 'Layers', snapshots: 'Snapshots', searchLayers: 'Search layers', searchSnapshots: 'Search snapshots', searchSnapshotsPlaceholder: 'Search by hash or title', latest: 'latest',
  noSnapshots: 'No snapshots yet. Mine the repository first.', noSnapshotMatch: 'No snapshot matches “{query}”.',
  // Issues
  issuesTip: '{label}: {breakdown}. Click to read them.', issuesNone: 'Nothing wrong was found. Click for the details.', consistent: '✓ Consistent with the import graph: {verified}', openList: '{label}. Open the list',
  setReference: 'Set reference architecture', reviewReference: 'Review reference', regenerate: 'Regenerate components', whatToDo: 'What to do: ', showInDiagram: 'Show in diagram',
  issues: 'Issues', issuesWhole: 'Issues for the whole map', problems: 'Problems', suggestions: 'Suggestions',
  // Canvas
  minimapLabel: 'Minimap: click or drag to move around the diagram', diagramLabel: 'Architecture diagram. Scroll to pan, Ctrl and scroll to zoom.',
  // AI model picker and run usage
  recommended: 'Recommended', default: 'Default', external: 'External', local: 'Local', score: 'Score {value}', fewRuns: ' (few runs)', success: '{pct} success', noRuns: 'No runs yet · ',
  estimate: '~{tokens} tokens, ~{cost}', perMillion: '{in}/{out} per 1M in/out',
  nameOnly: 'This snapshot is large: the model only names the components found by clustering.', whichModel: 'Which AI model groups and names the components.', aiModel: 'AI model',
  thanks: 'Thanks, this counts towards the model\'s score.', rateFailed: 'Could not save your rating.', usageFor: 'AI usage for this result',
  model: 'Model', input: 'Input', output: 'Output', total: 'Total', estimated: ' (estimated)', time: 'Time', cost: 'Cost', attempts: 'Attempts', useful: 'Useful?', yesUseful: 'Useful', notUseful: 'Not useful',
  high: 'High', medium: 'Medium', low: 'Low', tip: 'Tip',
  // Viewer
  exportFailed: 'Could not export the {format} file: {reason}', unknownError: 'unknown error', failedVerification: 'This view failed verification and is not drawn',
  close: 'Close', allComponents: 'All components', inside: ' · inside {name}', legend: 'Legend', circular: 'circular dependency', upward: 'points upward',
  details: 'Details', issuesCount: 'Issues · {n}', overview: 'Overview', showing: 'Showing: {title}', clearHighlight: 'Clear highlight',
  noPath: 'No dependency path: the first does not depend on the second.', properties: 'Properties', overviewIssues: 'Overview and issues', overviewIssuesN: 'Overview and issues ({n})',
  earlierNames: 'Earlier names', throughSnapshots: 'Through the snapshots', openSnapshot: 'Open snapshot {hash}',
  matchedFiles: 'Matched through the files it holds, snapshot by snapshot. A new grouping of the same files is not counted as a change.',
  keyScroll: 'Scroll / two fingers', keyDrag: 'Drag the background', keyCtrlScroll: 'Ctrl + scroll / pinch', keyClick: 'Click / Enter', keyDouble: 'Double-click / Shift+Enter',
  pan: 'Pan', zoomPointer: 'Zoom at the pointer', zoomInOut: 'Zoom in / out', fitWhole: 'Fit the whole diagram', zoomSelection: 'Zoom to the selection', toggleMinimap: 'Show or hide the minimap',
  fullScreenHelp: 'Full screen: only the diagram and its toolbar stay', sidePanels: 'Hide or show the side panels', focusComponent: 'Focus a component (click again to clear)',
  showInside: 'Show what is inside a component', findComponent: 'Find a component', escHelp: 'Clear focus, route or selection; then leave the inner view; then leave full screen',
  toggleTheme: 'Toggle light / dark theme', showCounts: 'Show dependency counts on all arrows', thisHelp: 'This help',
}, {
  tools: 'Công cụ sơ đồ', find: 'Tìm…  /', findNode: 'Tìm một nút',
  direct: 'Trực tiếp', directNeighbours: 'Nút kề trực tiếp', usedBy: 'Được dùng bởi', usedByAll: 'Được dùng bởi (mọi thứ phụ thuộc vào nó)', dependsOn: 'Phụ thuộc vào', dependsOnAll: 'Phụ thuộc vào (mọi thứ nó cần)',
  reach: 'Phạm vi phụ thuộc', route: 'Đường phụ thuộc', routeFrom: 'Điểm đầu', routeTo: 'Điểm cuối', from: 'Từ', to: 'Đến', routeHint: 'Làm nổi bật cách nút thứ nhất phụ thuộc vào nút thứ hai.', routeTool: 'Đường đi giữa hai nút',
  showRoles: 'Hiện theo vai trò', roleLens: 'Lọc vai trò', allRoles: 'Mọi vai trò', filterRole: 'Lọc theo vai trò',
  zoomOut: 'Thu nhỏ', zoomIn: 'Phóng to', zoomInKey: 'Phóng to  (+)', zoomOutKey: 'Thu nhỏ  (-)', fit: 'Vừa khung', fitKey: 'Vừa khung  (0)', zoomSel: 'Phóng tới phần đang chọn', zoomSelKey: 'Phóng tới phần đang chọn  (F)', zoomLevel: 'Thu phóng {pct}%, chọn mức',
  counts: 'Số phụ thuộc', countsAll: 'Số phụ thuộc trên mọi mũi tên', lightTheme: 'Giao diện sáng', darkTheme: 'Giao diện tối', minimap: 'Bản đồ thu nhỏ', layersPanel: 'Bảng lớp', detailsPanel: 'Bảng chi tiết',
  export: 'Xuất', svg: 'Ảnh SVG', png: 'Ảnh PNG', html: 'Tệp HTML độc lập', json: 'Dữ liệu (JSON)', fullScreen: 'Toàn màn hình', exitFullScreen: 'Thoát toàn màn hình', keyboard: 'Bàn phím và chuột', keyboardKey: 'Bàn phím và chuột  ?', more: 'Thêm',
  layers: 'Lớp', snapshots: 'Ảnh chụp', searchLayers: 'Tìm lớp', searchSnapshots: 'Tìm ảnh chụp', searchSnapshotsPlaceholder: 'Tìm theo mã hash hoặc tiêu đề', latest: 'mới nhất',
  noSnapshots: 'Chưa có ảnh chụp nào. Hãy chạy mining repository trước.', noSnapshotMatch: 'Không có ảnh chụp nào khớp “{query}”.',
  issuesTip: '{label}: {breakdown}. Bấm để xem.', issuesNone: 'Không phát hiện vấn đề nào. Bấm để xem chi tiết.', consistent: '✓ Khớp với đồ thị import: {verified}', openList: '{label}. Mở danh sách',
  setReference: 'Đặt kiến trúc tham chiếu', reviewReference: 'Xem lại tham chiếu', regenerate: 'Tạo lại các thành phần', whatToDo: 'Nên làm gì: ', showInDiagram: 'Hiện trên sơ đồ',
  issues: 'Vấn đề', issuesWhole: 'Vấn đề của toàn bản đồ', problems: 'Vấn đề', suggestions: 'Gợi ý',
  minimapLabel: 'Bản đồ thu nhỏ: bấm hoặc kéo để di chuyển quanh sơ đồ', diagramLabel: 'Sơ đồ kiến trúc. Cuộn để di chuyển, giữ Ctrl và cuộn để thu phóng.',
  recommended: 'Đề xuất', default: 'Mặc định', external: 'Bên ngoài', local: 'Cục bộ', score: 'Điểm {value}', fewRuns: ' (ít lượt chạy)', success: '{pct} thành công', noRuns: 'Chưa có lượt chạy · ',
  estimate: '~{tokens} token, ~{cost}', perMillion: '{in}/{out} mỗi 1 triệu token vào/ra',
  nameOnly: 'Ảnh chụp này lớn: mô hình chỉ đặt tên cho các thành phần tìm được bằng phân cụm.', whichModel: 'Mô hình AI dùng để nhóm và đặt tên các thành phần.', aiModel: 'Mô hình AI',
  thanks: 'Cảm ơn, đánh giá này được tính vào điểm của mô hình.', rateFailed: 'Không lưu được đánh giá của bạn.', usageFor: 'Mức dùng AI cho kết quả này',
  model: 'Mô hình', input: 'Vào', output: 'Ra', total: 'Tổng', estimated: ' (ước tính)', time: 'Thời gian', cost: 'Chi phí', attempts: 'Số lần thử', useful: 'Hữu ích?', yesUseful: 'Hữu ích', notUseful: 'Không hữu ích',
  high: 'Cao', medium: 'Trung bình', low: 'Thấp', tip: 'Mẹo',
  exportFailed: 'Không xuất được tệp {format}: {reason}', unknownError: 'lỗi không rõ', failedVerification: 'Sơ đồ này không vượt qua bước kiểm chứng nên không được vẽ',
  close: 'Đóng', allComponents: 'Mọi thành phần', inside: ' · bên trong {name}', legend: 'Chú giải', circular: 'phụ thuộc vòng', upward: 'đi ngược lên',
  details: 'Chi tiết', issuesCount: 'Vấn đề · {n}', overview: 'Tổng quan', showing: 'Đang hiện: {title}', clearHighlight: 'Bỏ làm nổi bật',
  noPath: 'Không có đường phụ thuộc: nút thứ nhất không phụ thuộc vào nút thứ hai.', properties: 'Thuộc tính', overviewIssues: 'Tổng quan và vấn đề', overviewIssuesN: 'Tổng quan và vấn đề ({n})',
  earlierNames: 'Tên trước đây', throughSnapshots: 'Qua các ảnh chụp', openSnapshot: 'Mở ảnh chụp {hash}',
  matchedFiles: 'Đối chiếu theo các tệp nó chứa, qua từng ảnh chụp. Nhóm lại cùng các tệp đó theo cách mới không được tính là thay đổi.',
  keyScroll: 'Cuộn / hai ngón tay', keyDrag: 'Kéo nền', keyCtrlScroll: 'Ctrl + cuộn / chụm', keyClick: 'Bấm / Enter', keyDouble: 'Bấm đúp / Shift+Enter',
  pan: 'Di chuyển', zoomPointer: 'Thu phóng tại con trỏ', zoomInOut: 'Phóng to / thu nhỏ', fitWhole: 'Vừa khung toàn sơ đồ', zoomSelection: 'Phóng tới phần đang chọn', toggleMinimap: 'Hiện hoặc ẩn bản đồ thu nhỏ',
  fullScreenHelp: 'Toàn màn hình: chỉ còn sơ đồ và thanh công cụ', sidePanels: 'Ẩn hoặc hiện các bảng bên', focusComponent: 'Tập trung vào một thành phần (bấm lần nữa để bỏ)',
  showInside: 'Xem bên trong một thành phần', findComponent: 'Tìm một thành phần', escHelp: 'Bỏ tập trung, đường đi hoặc lựa chọn; rồi rời chế độ xem bên trong; rồi thoát toàn màn hình',
  toggleTheme: 'Đổi giao diện sáng / tối', showCounts: 'Hiện số phụ thuộc trên mọi mũi tên', thisHelp: 'Bảng trợ giúp này',
});
