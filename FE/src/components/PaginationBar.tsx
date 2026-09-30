import { Pagination } from 'antd';

type Props = { current: number; pageSize: number; total: number; onChange: (page: number, size: number) => void };
export default function PaginationBar(props: Props) {
  return <nav aria-label="List pagination" className="flex justify-end border-t border-[#222c37] pt-4 mt-5 overflow-x-auto"><Pagination {...props} showSizeChanger pageSizeOptions={[5, 10, 20, 50]} showTotal={(total, range) => `${total ? range[0] : 0}–${range[1]} of ${total}`} responsive /></nav>;
}
