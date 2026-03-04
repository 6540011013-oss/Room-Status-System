class DatePicker {
  constructor(opts = {}) {
    this.opts = opts;
    this.container = null;
    this.currentMonth = new Date();
    this.selectedDate = null;
    this.startDate = null;
    this.endDate = null;
    this._build();
  }

  _build() {
    const wrap = document.createElement('div');
    wrap.className = 'rs-datepicker fixed inset-0 flex items-center justify-center z-50 hidden';
    wrap.innerHTML = `
      <div class="absolute inset-0 bg-black/40" data-role="backdrop"></div>
      <div class="relative w-full max-w-md p-6">
        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white font-semibold text-center">📅 เลือกช่วงวันที่</div>
          <div class="p-6">
            <div id="dp-selected-display" class="bg-gray-50 rounded-2xl p-5 text-center border-2 border-dashed border-gray-200 transition-all duration-300 mb-4">
              <p id="dp-placeholder" class="text-gray-400 text-lg">กรุณาเลือกวันเริ่มและวันสิ้นสุด</p>
              <p id="dp-selected" class="text-base font-semibold text-indigo-600 hidden"></p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div class="flex items-center justify-between mb-3">
                <button data-role="prev" class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50">◀</button>
                <div id="dp-current-month" class="font-medium text-gray-800"></div>
                <button data-role="next" class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50">▶</button>
              </div>
              <div class="grid grid-cols-7 gap-1 text-center text-sm text-gray-500 mb-2">
                <div class="text-red-400">อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div class="text-blue-400">ส</div>
              </div>
              <div id="dp-days" class="grid grid-cols-7 gap-1"></div>
            </div>
            <div class="mt-4 text-center">
              <button data-role="goto-today" class="text-indigo-600 font-medium">📍 ไปยังวันนี้</button>
            </div>
          </div>
          <div class="px-6 py-4">
            <button data-role="toggle" class="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-2xl">ปิด</button>
          </div>
        </div>
      </div>`;

    wrap.querySelector('[data-role="backdrop"]').addEventListener('click', () => this.close());
    wrap.querySelector('[data-role="toggle"]').addEventListener('click', () => this.close());
    wrap.querySelector('[data-role="goto-today"]').addEventListener('click', () => {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      this.startDate = new Date(t.getTime());
      this.endDate = new Date(t.getTime());
      this.selectedDate = new Date(t.getTime());
      this._emitSelection();
      this.renderCalendar();
      setTimeout(() => this.close(), 160);
    });
    wrap.querySelector('[data-role="prev"]').addEventListener('click', () => {
      this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
      this.renderCalendar();
    });
    wrap.querySelector('[data-role="next"]').addEventListener('click', () => {
      this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
      this.renderCalendar();
    });

    this.container = wrap;
    document.body.appendChild(this.container);
    this.renderCalendar();
  }

  _formatThaiDate(date) {
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const thaiDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const year = date.getFullYear() + 543;
    const weekday = thaiDays[date.getDay()];
    return `วัน${weekday}ที่ ${day} ${month} ${year}`;
  }

  _formatISODateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  isInRange(date) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    date = new Date(date);
    date.setHours(0, 0, 0, 0);
    return date <= t;
  }

  renderCalendar() {
    const monthTitle = this.container.querySelector('#dp-current-month');
    const daysEl = this.container.querySelector('#dp-days');
    const selectedEl = this.container.querySelector('#dp-selected');
    const placeholder = this.container.querySelector('#dp-placeholder');

    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    monthTitle.textContent = `${thaiMonths[month]} ${year + 543}`;

    daysEl.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const div = document.createElement('div');
      div.className = 'text-gray-300 py-3 rounded-xl';
      div.textContent = d;
      daysEl.appendChild(div);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const el = document.createElement('div');
      el.className = 'aspect-square flex items-center justify-center text-sm rounded-xl cursor-pointer transition-colors';
      const disabled = !this.isInRange(date);

      const isStart = this.startDate && date.getTime() === this.startDate.getTime();
      const isEnd = this.endDate && date.getTime() === this.endDate.getTime();
      const inSelectedRange = this.startDate && this.endDate
        && date.getTime() >= this.startDate.getTime()
        && date.getTime() <= this.endDate.getTime();

      if (disabled) {
        el.classList.add('text-gray-300');
      } else if (isEnd) {
        el.classList.add('bg-gradient-to-r', 'from-indigo-500', 'to-purple-600', 'text-white', 'font-semibold', 'shadow-md');
      } else if (isStart) {
        el.classList.add('bg-gradient-to-r', 'from-rose-400', 'to-pink-500', 'text-white', 'font-semibold', 'shadow-md');
      } else if (inSelectedRange) {
        el.classList.add('bg-indigo-50', 'text-indigo-700', 'font-semibold');
      } else if (date.getTime() === today.getTime()) {
        el.classList.add('bg-indigo-50', 'text-indigo-600', 'font-semibold', 'ring-2', 'ring-indigo-200');
      } else {
        el.classList.add('text-gray-700', 'hover:bg-indigo-50', 'hover:text-indigo-600');
      }

      el.textContent = d;
      if (!disabled) el.addEventListener('click', () => this._selectDate(date));
      daysEl.appendChild(el);
    }

    const totalCells = firstDay + daysInMonth;
    const rem = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= rem; i++) {
      const div = document.createElement('div');
      div.className = 'text-gray-300 py-3 rounded-xl';
      div.textContent = i;
      daysEl.appendChild(div);
    }

    if (this.startDate) {
      placeholder.classList.add('hidden');
      selectedEl.classList.remove('hidden');
      if (this.endDate) {
        selectedEl.textContent = `${this._formatThaiDate(this.startDate)} - ${this._formatThaiDate(this.endDate)}`;
      } else {
        selectedEl.textContent = `เริ่ม: ${this._formatThaiDate(this.startDate)}`;
      }
    } else {
      placeholder.classList.remove('hidden');
      selectedEl.classList.add('hidden');
    }
  }

  _selectDate(date) {
    const picked = new Date(date.getTime());
    picked.setHours(0, 0, 0, 0);
    this.selectedDate = picked;

    if (!this.startDate || (this.startDate && this.endDate)) {
      this.startDate = new Date(picked.getTime());
      this.endDate = null;
      this.renderCalendar();
      return;
    }

    if (!this.endDate) {
      if (picked.getTime() < this.startDate.getTime()) {
        this.endDate = new Date(this.startDate.getTime());
        this.startDate = new Date(picked.getTime());
      } else {
        this.endDate = new Date(picked.getTime());
      }
      this._emitSelection();
    }

    this.renderCalendar();
    if (this.startDate && this.endDate) {
      setTimeout(() => this.close(), 220);
    }
  }

  _emitSelection() {
    if (!this.startDate) return;
    const start = new Date(this.startDate.getTime());
    start.setHours(0, 0, 0, 0);
    const end = this.endDate ? new Date(this.endDate.getTime()) : new Date(start.getTime());
    end.setHours(0, 0, 0, 0);

    const detail = {
      date: this._formatISODateLocal(end),
      start_date: this._formatISODateLocal(start),
      end_date: this._formatISODateLocal(end),
      formatted: `${this._formatThaiDate(start)} - ${this._formatThaiDate(end)}`
    };
    document.dispatchEvent(new CustomEvent('date-selected', { detail }));
  }

  open() {
    this.container.classList.remove('hidden');
    this.renderCalendar();
  }

  close() {
    this.container.classList.add('hidden');
  }

  attachTo(element) {
    element.addEventListener('click', () => this.open());
  }
}

window.DatePicker = DatePicker;
