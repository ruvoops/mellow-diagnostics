(function () {
  "use strict";

  const STORAGE_KEY = "ruvo-mellow-diagnostics-v1";
  const DIAGNOSIS_DAYS = 14;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    form: $("#daily-form"),
    recordId: $("#record-id"),
    recordDate: $("#record-date"),
    dayStatus: $("#day-status"),
    workFields: $("#work-fields"),
    startTime: $("#start-time"),
    endTime: $("#end-time"),
    treatmentCount: $("#treatment-count"),
    treatmentMinutes: $("#treatment-minutes"),
    sameDayBookings: $("#same-day-bookings"),
    declinedBookings: $("#declined-bookings"),
    chartMinutes: $("#chart-minutes"),
    unfinishedCharts: $("#unfinished-charts"),
    cleaningMinutes: $("#cleaning-minutes"),
    adminMinutes: $("#admin-minutes"),
    sleepHours: $("#sleep-hours"),
    note: $("#note"),
    formError: $("#form-error"),
    cancelEdit: $("#cancel-edit"),
    voiceButton: $("#voice-button"),
    voiceTranscript: $("#voice-transcript"),
    applyTranscript: $("#apply-transcript"),
    voiceStatus: $("#voice-status"),
    progressCount: $("#progress-count"),
    progressBar: $("#progress-bar"),
    progressTrack: $(".progress-track"),
    progressMessage: $("#progress-message"),
    summaryCards: $("#summary-cards"),
    analysisPeriod: $("#analysis-period"),
    workChart: $("#work-chart"),
    sleepChart: $("#sleep-chart"),
    insightList: $("#insight-list"),
    historyBody: $("#history-body"),
    exportCsv: $("#export-csv"),
    printReport: $("#print-report"),
    clearData: $("#clear-data"),
  };

  let records = loadRecords();
  let recognition = null;
  let isListening = false;

  initialize();

  function initialize() {
    elements.recordDate.value = todayString();
    elements.sleepHours.value = "";
    bindEvents();
    configureSpeechRecognition();
    updateDayStatus();
    renderAll();
  }

  function bindEvents() {
    elements.form.addEventListener("submit", saveRecord);
    elements.dayStatus.addEventListener("change", updateDayStatus);
    elements.cancelEdit.addEventListener("click", resetForm);
    elements.applyTranscript.addEventListener("click", applyTranscriptToForm);
    elements.voiceButton.addEventListener("click", toggleVoiceInput);
    elements.exportCsv.addEventListener("click", exportCsv);
    elements.printReport.addEventListener("click", () => window.print());
    elements.clearData.addEventListener("click", clearAllRecords);
    elements.historyBody.addEventListener("click", handleHistoryAction);
  }

  function loadRecords() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(isValidRecord).sort(byDate) : [];
    } catch (error) {
      console.warn("保存データを読み込めませんでした。", error);
      return [];
    }
  }

  function isValidRecord(record) {
    return record && typeof record === "object" && /^\d{4}-\d{2}-\d{2}$/.test(record.date || "");
  }

  function persistRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function saveRecord(event) {
    event.preventDefault();
    hideFormError();

    const record = collectFormData();
    const error = validateRecord(record);
    if (error) {
      showFormError(error);
      return;
    }

    const duplicate = records.find((item) => item.date === record.date && item.id !== record.id);
    if (duplicate && !window.confirm(`${formatDate(record.date)}の記録はすでにあります。上書きしますか？`)) {
      return;
    }

    if (duplicate) {
      record.id = duplicate.id;
      records = records.filter((item) => item.id !== duplicate.id);
    } else {
      records = records.filter((item) => item.id !== record.id);
    }

    records.push(record);
    records.sort(byDate);
    persistRecords();
    renderAll();
    resetForm();
    showTransientStatus("記録を保存しました。", true);
    $("#dashboard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function collectFormData() {
    const isOpen = elements.dayStatus.value === "open";
    return {
      id: elements.recordId.value || createId(),
      date: elements.recordDate.value,
      status: elements.dayStatus.value,
      startTime: isOpen ? elements.startTime.value : "",
      endTime: isOpen ? elements.endTime.value : "",
      treatmentCount: isOpen ? numberValue(elements.treatmentCount) : 0,
      treatmentMinutes: isOpen ? numberValue(elements.treatmentMinutes) : 0,
      sameDayBookings: isOpen ? numberValue(elements.sameDayBookings) : 0,
      declinedBookings: isOpen ? numberValue(elements.declinedBookings) : 0,
      chartMinutes: isOpen ? numberValue(elements.chartMinutes) : 0,
      unfinishedCharts: isOpen ? numberValue(elements.unfinishedCharts) : 0,
      cleaningMinutes: isOpen ? numberValue(elements.cleaningMinutes) : 0,
      adminMinutes: isOpen ? numberValue(elements.adminMinutes) : 0,
      sleepHours: numberValue(elements.sleepHours),
      slotError: isOpen ? $("input[name='slotError']:checked").value === "true" : false,
      note: elements.note.value.trim(),
      updatedAt: new Date().toISOString(),
    };
  }

  function validateRecord(record) {
    if (!record.date) return "記録日を入力してください。";
    if (!Number.isFinite(record.sleepHours) || record.sleepHours < 0 || record.sleepHours > 24) {
      return "睡眠時間を0〜24時間で入力してください。";
    }
    if (record.status === "open" && (!record.startTime || !record.endTime)) {
      return "営業日の業務開始・終了時刻を入力してください。";
    }

    const numericFields = [
      record.treatmentCount,
      record.treatmentMinutes,
      record.sameDayBookings,
      record.declinedBookings,
      record.chartMinutes,
      record.unfinishedCharts,
      record.cleaningMinutes,
      record.adminMinutes,
    ];
    if (numericFields.some((value) => !Number.isFinite(value) || value < 0)) {
      return "件数と作業時間は0以上で入力してください。";
    }
    return "";
  }

  function resetForm() {
    elements.form.reset();
    elements.recordId.value = "";
    elements.recordDate.value = todayString();
    elements.dayStatus.value = "open";
    elements.voiceTranscript.value = "";
    elements.voiceStatus.textContent = "";
    elements.cancelEdit.hidden = true;
    $$("input[type='number']").forEach((input) => {
      input.value = input.id === "sleep-hours" ? "" : "0";
    });
    $("input[name='slotError'][value='false']").checked = true;
    hideFormError();
    updateDayStatus();
  }

  function updateDayStatus() {
    const isOpen = elements.dayStatus.value === "open";
    elements.workFields.hidden = !isOpen;
    elements.workFields.querySelectorAll("input, select").forEach((field) => {
      field.disabled = !isOpen;
    });
  }

  function renderAll() {
    renderProgress();
    renderDashboard();
    renderHistory();
  }

  function analysisRecords() {
    return records.slice(-DIAGNOSIS_DAYS);
  }

  function renderProgress() {
    const count = Math.min(records.length, DIAGNOSIS_DAYS);
    const percentage = (count / DIAGNOSIS_DAYS) * 100;
    elements.progressCount.textContent = String(count);
    elements.progressBar.style.width = `${percentage}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(count));

    if (count === 0) {
      elements.progressMessage.textContent = "最初の記録を登録すると診断が始まります。";
    } else if (count < DIAGNOSIS_DAYS) {
      elements.progressMessage.textContent = `あと${DIAGNOSIS_DAYS - count}日で診断結果が完成します。`;
    } else {
      elements.progressMessage.textContent = "14日分の診断データがそろいました。";
    }
  }

  function renderDashboard() {
    const data = analysisRecords();
    const openDays = data.filter((record) => record.status === "open");
    const averageWork = average(openDays.map(workMinutes));
    const totalTreatments = sum(openDays, "treatmentCount");
    const supportMinutes = sum(openDays, "chartMinutes") + sum(openDays, "cleaningMinutes") + sum(openDays, "adminMinutes");
    const averageSleep = average(data.map((record) => record.sleepHours));
    const totalSameDay = sum(openDays, "sameDayBookings");
    const totalDeclined = sum(openDays, "declinedBookings");
    const slotErrors = openDays.filter((record) => record.slotError).length;
    const latestUnfinished = openDays.length ? openDays[openDays.length - 1].unfinishedCharts : 0;

    const cards = [
      ["平均稼働時間", formatDuration(averageWork), ""],
      ["施術件数", totalTreatments, "件"],
      ["施術外業務", formatDuration(supportMinutes), ""],
      ["平均睡眠時間", formatDecimal(averageSleep), "時間"],
      ["当日予約", totalSameDay, "件"],
      ["断った予約", totalDeclined, "件"],
      ["予約枠の設定ミス", slotErrors, "日"],
      ["直近のカルテ未完了", latestUnfinished, "件"],
    ];

    elements.summaryCards.innerHTML = cards
      .map(
        ([label, value, unit]) =>
          `<article class="summary-card"><span>${label}</span><strong>${value}${unit ? `<small>${unit}</small>` : ""}</strong></article>`,
      )
      .join("");

    if (data.length) {
      elements.analysisPeriod.textContent = `${formatDate(data[0].date)}〜${formatDate(data[data.length - 1].date)}（直近${data.length}日分）`;
    } else {
      elements.analysisPeriod.textContent = "記録を登録すると集計が表示されます。";
    }

    renderWorkChart(data);
    renderSleepChart(data);
    renderInsights(data, openDays);
  }

  function renderWorkChart(data) {
    const openDays = data.filter((record) => record.status === "open");
    if (!openDays.length) {
      elements.workChart.className = "bar-chart empty-state";
      elements.workChart.textContent = "まだ営業日の記録がありません。";
      return;
    }

    const maxMinutes = Math.max(...openDays.map(workMinutes), 1);
    elements.workChart.className = "bar-chart";
    elements.workChart.innerHTML = openDays
      .map((record) => {
        const total = workMinutes(record);
        const treatment = Math.min(record.treatmentMinutes, total);
        const other = Math.max(total - treatment, 0);
        const totalHeight = Math.max((total / maxMinutes) * 170, 2);
        const treatmentHeight = total ? (treatment / total) * totalHeight : 0;
        const otherHeight = Math.max(totalHeight - treatmentHeight, 0);
        return `<div class="bar-column" title="${formatDate(record.date)} ${formatDuration(total)}">
          <div class="bar-stack" style="height:${totalHeight}px">
            <span class="bar-other" style="height:${otherHeight}px"></span>
            <span class="bar-treatment" style="height:${treatmentHeight}px"></span>
          </div>
          <span class="bar-label">${shortDate(record.date)}</span>
        </div>`;
      })
      .join("");
  }

  function renderSleepChart(data) {
    if (!data.length) {
      elements.sleepChart.className = "bar-chart empty-state";
      elements.sleepChart.textContent = "まだ記録がありません。";
      return;
    }

    const maxHours = Math.max(10, ...data.map((record) => record.sleepHours));
    elements.sleepChart.className = "bar-chart";
    elements.sleepChart.innerHTML = data
      .map((record) => {
        const height = Math.max((record.sleepHours / maxHours) * 170, 2);
        return `<div class="bar-column" title="${formatDate(record.date)} ${formatDecimal(record.sleepHours)}時間">
          <div class="bar-stack" style="height:${height}px"><span class="bar-sleep" style="height:100%"></span></div>
          <span class="bar-label">${shortDate(record.date)}</span>
        </div>`;
      })
      .join("");
  }

  function renderInsights(data, openDays) {
    if (data.length < 3) {
      elements.insightList.innerHTML = "<li>記録が3日以上たまると、傾向を表示します。</li>";
      return;
    }

    const insights = [];
    const averageWorkMinutes = average(openDays.map(workMinutes));
    const averageSleepHours = average(data.map((record) => record.sleepHours));
    const unfinishedDays = openDays.filter((record) => record.unfinishedCharts > 0).length;
    const withSameDay = openDays.filter((record) => record.sameDayBookings > 0);
    const withoutSameDay = openDays.filter((record) => record.sameDayBookings === 0);

    if (averageWorkMinutes >= 600) {
      insights.push(`平均稼働時間は${formatDuration(averageWorkMinutes)}です。予約上限と最終受付時刻の見直し候補です。`);
    } else {
      insights.push(`平均稼働時間は${formatDuration(averageWorkMinutes)}です。`);
    }

    if (averageSleepHours < 6) {
      insights.push(`平均睡眠時間は${formatDecimal(averageSleepHours)}時間です。業務終了後の作業削減を優先する必要があります。`);
    } else {
      insights.push(`平均睡眠時間は${formatDecimal(averageSleepHours)}時間です。`);
    }

    if (unfinishedDays > 0) {
      insights.push(`${openDays.length}営業日のうち${unfinishedDays}日で未完了カルテが発生しています。音声カルテの検証対象です。`);
    }

    if (withSameDay.length >= 2 && withoutSameDay.length >= 2) {
      const difference = average(withSameDay.map(workMinutes)) - average(withoutSameDay.map(workMinutes));
      const relation = difference >= 0 ? "長く" : "短く";
      insights.push(`当日予約がある日は、ない日より稼働時間が平均${formatDuration(Math.abs(difference))}${relation}なっています。`);
    }

    if (!insights.length) insights.push("現時点で明確な偏りは確認できません。記録を続けてください。");
    elements.insightList.innerHTML = insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function renderHistory() {
    if (!records.length) {
      elements.historyBody.innerHTML = '<tr><td class="table-empty" colspan="7">まだ記録がありません。</td></tr>';
      return;
    }

    elements.historyBody.innerHTML = [...records]
      .reverse()
      .map((record) => {
        const closed = record.status === "closed";
        return `<tr>
          <td>${formatDate(record.date)}</td>
          <td>${closed ? "休業" : formatDuration(workMinutes(record))}</td>
          <td>${closed ? "—" : `${record.treatmentCount}件 / ${formatDuration(record.treatmentMinutes)}`}</td>
          <td>${closed ? "—" : `${record.sameDayBookings}件`}</td>
          <td>${closed ? "—" : `${formatDuration(record.chartMinutes)} / 未完了${record.unfinishedCharts}件`}</td>
          <td>${formatDecimal(record.sleepHours)}時間</td>
          <td>
            <button class="table-action" type="button" data-action="edit" data-id="${record.id}">編集</button>
            <button class="table-action delete" type="button" data-action="delete" data-id="${record.id}">削除</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function handleHistoryAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const record = records.find((item) => item.id === button.dataset.id);
    if (!record) return;

    if (button.dataset.action === "delete") {
      if (!window.confirm(`${formatDate(record.date)}の記録を削除しますか？`)) return;
      records = records.filter((item) => item.id !== record.id);
      persistRecords();
      renderAll();
      return;
    }

    populateForm(record);
    $("#entry").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function populateForm(record) {
    elements.recordId.value = record.id;
    elements.recordDate.value = record.date;
    elements.dayStatus.value = record.status;
    elements.startTime.value = record.startTime;
    elements.endTime.value = record.endTime;
    elements.treatmentCount.value = record.treatmentCount;
    elements.treatmentMinutes.value = record.treatmentMinutes;
    elements.sameDayBookings.value = record.sameDayBookings;
    elements.declinedBookings.value = record.declinedBookings;
    elements.chartMinutes.value = record.chartMinutes;
    elements.unfinishedCharts.value = record.unfinishedCharts;
    elements.cleaningMinutes.value = record.cleaningMinutes;
    elements.adminMinutes.value = record.adminMinutes;
    elements.sleepHours.value = record.sleepHours;
    elements.note.value = record.note || "";
    $(`input[name='slotError'][value='${String(record.slotError)}']`).checked = true;
    elements.cancelEdit.hidden = false;
    updateDayStatus();
  }

  function configureSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      elements.voiceButton.disabled = true;
      elements.voiceButton.title = "このブラウザは音声認識に対応していません。";
      elements.voiceButton.querySelector("span:last-child").textContent = "音声入力は未対応";
      elements.voiceStatus.textContent = "文章を入力して「フォームへ反映」を利用できます。";
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.addEventListener("start", () => setListeningState(true));
    recognition.addEventListener("end", () => {
      setListeningState(false);
      if (elements.voiceTranscript.value.trim()) applyTranscriptToForm();
    });
    recognition.addEventListener("result", (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      const existing = elements.voiceTranscript.dataset.final || elements.voiceTranscript.value;
      if (finalText) {
        const combined = `${existing} ${finalText}`.trim();
        elements.voiceTranscript.dataset.final = combined;
        elements.voiceTranscript.value = combined;
      } else {
        elements.voiceTranscript.value = `${existing} ${interimText}`.trim();
      }
    });
    recognition.addEventListener("error", (event) => {
      const messages = {
        "not-allowed": "マイクの利用が許可されていません。",
        "no-speech": "音声を認識できませんでした。もう一度お試しください。",
        network: "音声認識サービスに接続できませんでした。",
      };
      elements.voiceStatus.textContent = messages[event.error] || "音声入力でエラーが発生しました。";
      setListeningState(false);
    });
  }

  function toggleVoiceInput() {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      return;
    }
    elements.voiceTranscript.dataset.final = elements.voiceTranscript.value.trim();
    elements.voiceStatus.textContent = "話してください。終了すると自動で反映します。";
    recognition.start();
  }

  function setListeningState(listening) {
    isListening = listening;
    elements.voiceButton.classList.toggle("is-listening", listening);
    elements.voiceButton.querySelector("span:last-child").textContent = listening ? "音声入力を終了" : "音声入力を開始";
  }

  function applyTranscriptToForm() {
    const original = elements.voiceTranscript.value.trim();
    if (!original) {
      elements.voiceStatus.textContent = "認識した内容または文章を入力してください。";
      return;
    }

    const parsed = parseTranscript(original);
    const applied = [];
    setIfPresent(elements.startTime, parsed.startTime, "開始時刻", applied);
    setIfPresent(elements.endTime, parsed.endTime, "終了時刻", applied);
    setIfPresent(elements.treatmentCount, parsed.treatmentCount, "施術件数", applied);
    setIfPresent(elements.treatmentMinutes, parsed.treatmentMinutes, "施術時間", applied);
    setIfPresent(elements.sameDayBookings, parsed.sameDayBookings, "当日予約", applied);
    setIfPresent(elements.declinedBookings, parsed.declinedBookings, "断った予約", applied);
    setIfPresent(elements.chartMinutes, parsed.chartMinutes, "カルテ時間", applied);
    setIfPresent(elements.unfinishedCharts, parsed.unfinishedCharts, "未完了カルテ", applied);
    setIfPresent(elements.cleaningMinutes, parsed.cleaningMinutes, "清掃・洗濯", applied);
    setIfPresent(elements.adminMinutes, parsed.adminMinutes, "経理・販促", applied);
    setIfPresent(elements.sleepHours, parsed.sleepHours, "睡眠", applied);

    if (typeof parsed.slotError === "boolean") {
      $(`input[name='slotError'][value='${String(parsed.slotError)}']`).checked = true;
      applied.push("予約枠ミス");
    }

    elements.voiceStatus.textContent = applied.length
      ? `${applied.join("、")}を反映しました。内容を確認してください。`
      : "項目を読み取れませんでした。フォームへ直接入力してください。";
  }

  function parseTranscript(input) {
    const text = normalizeTranscript(input);
    const result = {};

    const range = text.match(/(\d{1,2})時(?:(\d{1,2})分|(半))?\s*から\s*(\d{1,2})時(?:(\d{1,2})分|(半))?\s*まで/);
    if (range) {
      result.startTime = makeTime(range[1], range[3] ? 30 : range[2]);
      result.endTime = makeTime(range[4], range[6] ? 30 : range[5]);
    }

    result.startTime ||= extractTime(text, ["業務開始", "営業開始", "開始"]);
    result.endTime ||= extractTime(text, ["業務終了", "営業終了", "終了"]);

    result.treatmentCount = extractCount(text, ["施術件数", "施術"], "件");
    result.sameDayBookings = extractCount(text, ["当日予約"], "件");
    result.declinedBookings = extractCount(text, ["断った予約", "予約を断った", "お断り"], "件");
    const declinedByWordOrder = text.match(/予約を\s*(\d+)\s*件\s*断/);
    if (declinedByWordOrder) result.declinedBookings = Number(declinedByWordOrder[1]);
    result.unfinishedCharts = extractCount(text, ["カルテ未完了", "未完了"], "件");
    result.treatmentMinutes = extractDurationAfter(text, ["施術時間", "施術合計", "合計"]);
    result.chartMinutes = extractDurationAfter(text, ["カルテ作成", "カルテ"]);
    result.cleaningMinutes = extractDurationAfter(text, ["清掃と洗濯", "清掃・洗濯", "清掃", "洗濯"]);
    result.adminMinutes = extractCombinedAdminMinutes(text);
    const sleepMinutes = extractDurationAfter(text, ["睡眠時間", "睡眠"]);
    if (Number.isFinite(sleepMinutes)) result.sleepHours = sleepMinutes / 60;

    if (/設定ミス(?:は|が)?(?:なし|なかった|ありません)/.test(text)) result.slotError = false;
    else if (/設定ミス(?:は|が)?(?:あり|あった|あります)/.test(text)) result.slotError = true;

    return result;
  }

  function normalizeTranscript(input) {
    return convertJapaneseNumerals(
      input
        .normalize("NFKC")
        .replace(/[、。,.]/g, " ")
        .replace(/午前0時/g, "0時")
        .replace(/午後(\d{1,2})時/g, (_, hour) => `${(Number(hour) % 12) + 12}時`)
        .replace(/午前(\d{1,2})時/g, "$1時"),
    );
  }

  function convertJapaneseNumerals(text) {
    return text.replace(/[〇零一二三四五六七八九十百]+/g, (token) => String(parseJapaneseNumber(token)));
  }

  function parseJapaneseNumber(token) {
    const digits = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (!/[十百]/.test(token)) return Number([...token].map((character) => digits[character]).join(""));
    let total = 0;
    let current = 0;
    for (const character of token) {
      if (character === "百") {
        total += (current || 1) * 100;
        current = 0;
      } else if (character === "十") {
        total += (current || 1) * 10;
        current = 0;
      } else {
        current = digits[character];
      }
    }
    return total + current;
  }

  function extractTime(text, labels) {
    for (const label of labels) {
      const escaped = escapeRegExp(label);
      const before = text.match(new RegExp(`(\\d{1,2})時(?:(\\d{1,2})分|(半))?\\s*${escaped}`));
      if (before) return makeTime(before[1], before[3] ? 30 : before[2]);
      const after = text.match(new RegExp(`${escaped}(?:は|が)?\\s*(\\d{1,2})時(?:(\\d{1,2})分|(半))?`));
      if (after) return makeTime(after[1], after[3] ? 30 : after[2]);
    }
    return undefined;
  }

  function extractCount(text, labels, unit) {
    for (const label of labels) {
      const escaped = escapeRegExp(label);
      const after = text.match(new RegExp(`${escaped}(?:は|が|を)?[^\\d]{0,7}(\\d+)\\s*${unit}`));
      if (after) return Number(after[1]);
      const before = text.match(new RegExp(`(\\d+)\\s*${unit}[^。、]{0,5}${escaped}`));
      if (before) return Number(before[1]);
    }
    return undefined;
  }

  function extractDurationAfter(text, labels) {
    for (const label of labels) {
      const escaped = escapeRegExp(label);
      const match = text.match(new RegExp(`${escaped}(?:は|が|を|で)?[^\\d]{0,8}(\\d+(?:\\.\\d+)?)\\s*(時間|分)(?:\\s*(半|\\d+分))?`));
      if (!match) continue;
      const value = Number(match[1]);
      if (match[2] === "分") return value;
      const additional = match[3] === "半" ? 30 : Number((match[3] || "0").replace("分", ""));
      return Math.round(value * 60 + additional);
    }
    return undefined;
  }

  function extractCombinedAdminMinutes(text) {
    const accounting = extractDurationAfter(text, ["経理"]);
    const promotion = extractDurationAfter(text, ["販促"]);
    const combined = extractDurationAfter(text, ["経理と販促", "経理・販促"]);
    if (Number.isFinite(combined)) return combined;
    if (Number.isFinite(accounting) || Number.isFinite(promotion)) return (accounting || 0) + (promotion || 0);
    return undefined;
  }

  function setIfPresent(element, value, label, applied) {
    if (value === undefined || value === null || Number.isNaN(value)) return;
    element.value = value;
    applied.push(label);
  }

  function exportCsv() {
    if (!records.length) {
      window.alert("出力する記録がありません。");
      return;
    }

    const headers = [
      "記録日", "営業状況", "業務開始", "業務終了", "稼働時間(分)", "施術件数", "施術時間(分)",
      "当日予約件数", "カルテ作成時間(分)", "カルテ未完了件数", "清掃・洗濯時間(分)",
      "経理・販促時間(分)", "睡眠時間", "断った予約件数", "予約枠設定ミス", "補足",
    ];
    const rows = records.map((record) => [
      record.date,
      record.status === "open" ? "営業日" : "休業日",
      record.startTime,
      record.endTime,
      record.status === "open" ? workMinutes(record) : 0,
      record.treatmentCount,
      record.treatmentMinutes,
      record.sameDayBookings,
      record.chartMinutes,
      record.unfinishedCharts,
      record.cleaningMinutes,
      record.adminMinutes,
      record.sleepHours,
      record.declinedBookings,
      record.slotError ? "あり" : "なし",
      record.note,
    ]);
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadFile(csv, `mellow_業務診断_${todayString()}.csv`, "text/csv;charset=utf-8");
  }

  function clearAllRecords() {
    if (!records.length) return;
    if (!window.confirm("すべての記録を削除します。この操作は元に戻せません。先にCSV出力することをおすすめします。")) return;
    records = [];
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    resetForm();
  }

  function workMinutes(record) {
    if (!record || record.status !== "open" || !record.startTime || !record.endTime) return 0;
    const [startHour, startMinute] = record.startTime.split(":").map(Number);
    const [endHour, endMinute] = record.endTime.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    let end = endHour * 60 + endMinute;
    if (end < start) end += 24 * 60;
    return Math.max(end - start, 0);
  }

  function sum(items, key) {
    return items.reduce((total, item) => total + Number(item[key] || 0), 0);
  }

  function average(values) {
    const valid = values.filter((value) => Number.isFinite(value));
    return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : 0;
  }

  function formatDuration(minutes) {
    const rounded = Math.round(Number(minutes) || 0);
    const hours = Math.floor(rounded / 60);
    const rest = rounded % 60;
    if (!hours) return `${rest}分`;
    return rest ? `${hours}時間${rest}分` : `${hours}時間`;
  }

  function formatDecimal(value) {
    return Number(value || 0).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  }

  function formatDate(date) {
    if (!date) return "";
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
  }

  function shortDate(date) {
    const [, month, day] = date.split("-");
    return `${Number(month)}/${Number(day)}`;
  }

  function makeTime(hour, minute) {
    const normalizedHour = Number(hour) % 24;
    const normalizedMinute = Number(minute || 0);
    if (normalizedMinute > 59) return undefined;
    return `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
  }

  function numberValue(element) {
    return element.value === "" ? NaN : Number(element.value);
  }

  function byDate(a, b) {
    return a.date.localeCompare(b.date);
  }

  function todayString() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function createId() {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadFile(content, fileName, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function showFormError(message) {
    elements.formError.textContent = message;
    elements.formError.hidden = false;
    elements.formError.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideFormError() {
    elements.formError.hidden = true;
    elements.formError.textContent = "";
  }

  function showTransientStatus(message, success) {
    elements.voiceStatus.textContent = message;
    elements.voiceStatus.style.color = success ? "#d7f4eb" : "";
    window.setTimeout(() => {
      if (elements.voiceStatus.textContent === message) elements.voiceStatus.textContent = "";
    }, 4000);
  }
})();
