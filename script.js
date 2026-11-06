/* =========================================================
   ECOWAST — DASHBOARD INTERACTION
   Frontend simulation only. No physical hardware control.
========================================================= */

"use strict";

const $ = (id) => document.getElementById(id);

const elements = {
    ph: $("ph"),
    turbidity: $("turbidity"),
    moisture: $("moisture"),
    tank1: $("tank1Input"),
    tank2: $("tank2Input"),
    pump1: $("pump1"),
    pump2: $("pump2"),
    pump3: $("pump3")
};

const state = {
    pumps: {
        pump1: false,
        pump2: true,
        pump3: false
    }
};

const sensorHistory = {
    ph: [],
    turbidity: [],
    moisture: [],
    tank1: [],
    tank2: []
};

function drawSensorChart(id, values, min, max) {
    const canvas = $(id);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);

    const width = rect.width;
    const height = rect.height;
    const left = 32;
    const right = 7;
    const top = 8;
    const bottom = 18;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const yFor = (value) => top + (1 - Math.min(1, Math.max(0, (value - min) / (max - min)))) * plotHeight;

    context.font = "10px Inter, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.lineWidth = 1;
    for (let tick = 0; tick <= 4; tick++) {
        const value = max - ((max - min) * tick) / 4;
        const y = top + (plotHeight * tick) / 4;
        context.strokeStyle = "#dedede";
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(width - right, y);
        context.stroke();
        context.fillStyle = "#666666";
        context.fillText(Number.isInteger(value) ? String(value) : value.toFixed(1), left - 5, y);
    }

    if (!values.length) return;
    const gap = Math.min(5, plotWidth / (values.length * 2));
    const barWidth = Math.max(2, (plotWidth - gap * (values.length - 1)) / values.length);
    const centers = [];
    values.forEach((value, index) => {
        const x = left + index * (barWidth + gap);
        const y = yFor(value);
        centers.push({ x: x + barWidth / 2, y });
        context.fillStyle = "#4472c4";
        context.fillRect(x, y, barWidth, top + plotHeight - y);
    });

    // The orange line shows a short moving average over the bar readings.
    const trend = centers.map((point, index) => {
        const first = Math.max(0, index - 2);
        const average = values.slice(first, index + 1).reduce((sum, value) => sum + value, 0) / (index - first + 1);
        return { x: point.x, y: yFor(average) };
    });
    context.beginPath();
    trend.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.strokeStyle = "#ed7d31";
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
}

function updateSensorCharts(data) {
    const ranges = {
        ph: [0, 14],
        turbidity: [0, 100],
        moisture: [0, 100],
        tank1: [0, 100],
        tank2: [0, 100]
    };
    Object.entries(ranges).forEach(([key, [min, max]]) => {
        const history = sensorHistory[key];
        if (!history.length) history.push(...Array(11).fill(data[key]));
        history.push(data[key]);
        if (history.length > 12) history.shift();
        drawSensorChart(`${key}Chart`, history, min, max);
    });
}

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function setStateClass(element, className) {
    element.classList.remove("state-good", "state-warning", "state-danger");
    element.classList.add(className);
}

function readSensors() {
    return {
        ph: Number(elements.ph.value),
        turbidity: Number(elements.turbidity.value),
        moisture: Number(elements.moisture.value),
        tank1: Number(elements.tank1.value),
        tank2: Number(elements.tank2.value)
    };
}

function updateSensorLabels(data) {
    setText("phValue", data.ph.toFixed(1));
    setText("turbidityValue", `${data.turbidity.toFixed(1)} NTU`);
    setText("moistureValue", `${data.moisture}%`);
    setText("tank1Value", `${data.tank1.toFixed(1)}%`);
    setText("tank2Value", `${data.tank2.toFixed(1)}%`);
}

function updateTankVisuals(data) {
    $("rawWater").style.height = `${data.tank1}%`;
    $("cleanWater").style.height = `${data.tank2}%`;

    setText("tank1Label", `${data.tank1.toFixed(1)}%`);
    setText("tank2Label", `${data.tank2.toFixed(1)}%`);
    setText("rawPercentage", `${data.tank1.toFixed(1)}%`);
    setText("cleanPercentage", `${data.tank2.toFixed(1)}%`);
}

function evaluateWater(data) {
    // Demonstration thresholds only. Not a drinking-water certification.
    const phWithinTarget = data.ph >= 6.5 && data.ph <= 8.5;
    const turbidityWithinTarget = data.turbidity < 5;
    const passed = phWithinTarget && turbidityWithinTarget;

    const quality = $("waterQuality");
    const rawStatus = $("rawStatus");

    if (passed) {
        quality.textContent = "WITHIN TARGET";
        setStateClass(quality, "state-good");
        rawStatus.textContent = "Within target";
    } else {
        quality.textContent = "CHECK REQUIRED";
        setStateClass(quality, "state-warning");
        rawStatus.textContent = "Requires evaluation";
    }

    return passed;
}

function evaluateTank(data) {
    const cleanStatus = $("cleanStatus");
    const capacityStatus = $("capacityStatus");

    if (data.tank2 >= 95) {
        cleanStatus.textContent = "HIGH LEVEL";
        capacityStatus.textContent = "NEAR FULL";
        setStateClass(capacityStatus, "state-danger");
    } else if (data.tank2 <= 10) {
        cleanStatus.textContent = "LOW LEVEL";
        capacityStatus.textContent = "LOW";
        setStateClass(capacityStatus, "state-warning");
    } else {
        cleanStatus.textContent = "Available capacity";
        capacityStatus.textContent = "AVAILABLE";
        setStateClass(capacityStatus, "state-good");
    }
}

function updateProcess(data, waterPassed) {
    const flowMode = $("flowMode");
    const transferStatus = $("transferStatus");

    if (!waterPassed) {
        flowMode.textContent = "RE-FILTRATION";
        transferStatus.textContent = "QUALITY CHECK REQUIRED";
        setStateClass(flowMode, "state-warning");
    } else if (data.tank2 >= 95) {
        flowMode.textContent = "TRANSFER STOP";
        transferStatus.textContent = "TANK 02 HIGH LEVEL";
        setStateClass(flowMode, "state-danger");
    } else if (!state.pumps.pump2) {
        flowMode.textContent = "TRANSFER OFF";
        transferStatus.textContent = "TRANSFER DISABLED";
        setStateClass(flowMode, "state-warning");
    } else {
        flowMode.textContent = "TRANSFER";
        transferStatus.textContent = "TRANSFER ENABLED";
        setStateClass(flowMode, "state-good");
    }
}

function updateLCD(data, waterPassed) {
    const p1 = state.pumps.pump1 ? "ON" : "OFF";
    const p2 = state.pumps.pump2 ? "ON" : "OFF";
    const p3 = state.pumps.pump3 ? "ON" : "OFF";

    setText("lcd1", `PH: ${data.ph.toFixed(1)}  TURB: ${data.turbidity.toFixed(1)} NTU`);
    setText("lcd2", `RAW: ${data.tank1.toFixed(0)}%  CLEAN: ${data.tank2.toFixed(0)}%`);
    setText("lcd3", `MODE: ${waterPassed ? "PASS" : "CHECK"} / ${data.tank2 >= 95 ? "STOP" : "PROCESS"}`);
    setText("lcd4", `P1: ${p1}  P2: ${p2}  P3: ${p3}`);
}

function updatePumpButtons() {
    Object.entries(state.pumps).forEach(([key, active]) => {
        const button = elements[key];
        button.classList.toggle("active", active);
        button.textContent = active ? "ON" : "OFF";
        button.setAttribute("aria-pressed", String(active));
    });
}

function updateDashboard() {
    const data = readSensors();

    updateSensorLabels(data);
    updateSensorCharts(data);
    updateTankVisuals(data);

    const waterPassed = evaluateWater(data);
    evaluateTank(data);
    updateProcess(data, waterPassed);
    updatePumpButtons();
    updateLCD(data, waterPassed);
}

function togglePump(key) {
    state.pumps[key] = !state.pumps[key];
    updateDashboard();
}

elements.ph.addEventListener("input", updateDashboard);
elements.turbidity.addEventListener("input", updateDashboard);
elements.moisture.addEventListener("input", updateDashboard);
elements.tank1.addEventListener("input", updateDashboard);
elements.tank2.addEventListener("input", updateDashboard);

elements.pump1.addEventListener("click", () => togglePump("pump1"));
elements.pump2.addEventListener("click", () => togglePump("pump2"));
elements.pump3.addEventListener("click", () => togglePump("pump3"));

function updateClock() {
    const now = new Date();
    const clock = $("clock");
    if (clock) {
        clock.textContent = now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    }
}


function updateWelcomeDate() {
    const target = document.getElementById("welcomeDate");
    if (!target) return;

    target.textContent = new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function initializeProfileSettings() {
    const usernameDisplay = $("operatorUsername");
    const usernameInput = $("usernameInput");
    const settingsToggle = $("settingsToggle");
    const settingsPanel = $("settingsPanel");
    if (!usernameDisplay || !usernameInput || !settingsToggle || !settingsPanel) return;

    const savedUsername = localStorage.getItem("ecowast-username");
    if (savedUsername) usernameDisplay.textContent = savedUsername;
    usernameInput.value = usernameDisplay.textContent;

    settingsToggle.addEventListener("click", () => {
        const open = settingsPanel.hidden;
        settingsPanel.hidden = !open;
        settingsToggle.setAttribute("aria-expanded", String(open));
        if (open) usernameInput.focus();
    });

    settingsPanel.addEventListener("submit", (event) => {
        event.preventDefault();
        const username = usernameInput.value.trim();
        if (!username) return;
        usernameDisplay.textContent = username;
        localStorage.setItem("ecowast-username", username);
        settingsPanel.hidden = true;
        settingsToggle.setAttribute("aria-expanded", "false");
    });
}

function initializeSensorCarousel() {
    const carousel = $("sensorCarousel");
    const track = $("sensorTrack");
    const previous = $("sensorPrevious");
    const next = $("sensorNext");
    const page = $("sensorPage");
    if (!carousel || !track || !previous || !next || !page) return;

    const slides = Array.from(track.querySelectorAll(".sensor-item"));
    let activeIndex = 0;
    let touchStartX = null;

    function showSlide(index) {
        activeIndex = Math.max(0, Math.min(index, slides.length - 1));
        track.style.transform = `translateX(-${activeIndex * 100}%)`;
        page.textContent = `${activeIndex + 1} / ${slides.length}`;
        previous.disabled = activeIndex === 0;
        next.disabled = activeIndex === slides.length - 1;
        slides.forEach((slide, slideIndex) => {
            slide.setAttribute("aria-hidden", String(slideIndex !== activeIndex));
            slide.inert = slideIndex !== activeIndex;
        });
    }

    previous.addEventListener("click", () => showSlide(activeIndex - 1));
    next.addEventListener("click", () => showSlide(activeIndex + 1));
    carousel.addEventListener("touchstart", (event) => {
        if (event.target.closest("input, button")) return;
        touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });
    carousel.addEventListener("touchend", (event) => {
        if (touchStartX === null) return;
        const distance = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(distance) > 45) showSlide(activeIndex + (distance < 0 ? 1 : -1));
        touchStartX = null;
    }, { passive: true });
    showSlide(activeIndex);
}

updateDashboard();
updateWelcomeDate();
initializeProfileSettings();
initializeSensorCarousel();
updateClock();
setInterval(updateClock, 1000);
window.addEventListener("resize", updateDashboard);

console.info("ECOWAST interface initialized — simulation mode.");
