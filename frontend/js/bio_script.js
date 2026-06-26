function adjustSVGSize() {
    const svg = document.getElementById("mySVG");
    const mainDiv = document.getElementById("main");

    const mainWidth = mainDiv.clientWidth;
    const mainHeight = mainDiv.clientHeight;

    svg.setAttribute("width", mainWidth);
    svg.setAttribute("height", mainHeight);
}

window.onload = adjustSVGSize;
window.onresize = adjustSVGSize;

d3.json('../data/bio_courses_tag.json').then(coursesData => {

    // Category uses the `category` array field (e.g. ["Introductory", "Fundamentals"])
    const categories = [...new Set(coursesData.flatMap(course => course.category))].sort();
    // Theme uses the `theme` array field (renamed from `themes` in the general dataset)
    const themes = [...new Set(coursesData.flatMap(course => course.theme))].sort();
    // Level uses the numeric `level` field (1–4) rather than deriving from the course code
    const levels = [...new Set(coursesData.map(course => course.level))]
                    .sort((a, b) => a - b)
                    .map(l => `${l * 100} level`);

    // Courses with no prerequisites, no corequisites, and not referenced by any other course
    const referencedCodes = new Set(coursesData.flatMap(c => [...c.prerequisites, ...c.corequisites]));
    const standaloneSet = new Set(
        coursesData
            .filter(c => c.prerequisites.length === 0 && c.corequisites.length === 0 && !referencedCodes.has(c.course_code))
            .map(c => c.course_code)
    );

    const categoryDropdownButton  = document.getElementById("dropdownButton");
    const categoryDropdownContent = document.getElementById("dropdownContent");

    const themesDropdownButton  = document.getElementById("dropdownButton-2");
    const themesDropdownContent = document.getElementById("dropdownContent-2");

    const levelsDropdownButton  = document.getElementById("dropdownButton-3");
    const levelsDropdownContent = document.getElementById("dropdownContent-3");

    let selectedCategories = [];
    let selectedThemes = [];
    let selectedLevel = [];
    let showStandalone = false;
    let coreqEdgeIds = new Set();
    let frozenCourseId = null;
    let _unfreezeSelection = null;
    let _selectCourse = null;
    let _zoom = null;

    const svg = d3.select("svg");

    // ── Category filter ───────────────────────────────────────────────────────
    categories.forEach(category => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = category;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedCategories.push(this.value);
            } else {
                selectedCategories = selectedCategories.filter(c => c !== this.value);
            }
            categoryDropdownButton.textContent = selectedCategories.length > 0
                ? `Category: ${selectedCategories.length} selected`
                : "Select Category";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(category));
        categoryDropdownContent.appendChild(label);
    });

    // ── Theme filter ─────────────────────────────────────────────────────────
    themes.forEach(theme => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = theme;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedThemes.push(this.value);
            } else {
                selectedThemes = selectedThemes.filter(t => t !== this.value);
            }
            themesDropdownButton.textContent = selectedThemes.length > 0
                ? `Theme: ${selectedThemes.length} selected`
                : "Select Theme";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(theme));
        themesDropdownContent.appendChild(label);
    });

    // ── Level filter ─────────────────────────────────────────────────────────
    levels.forEach(level => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = level;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedLevel.push(this.value);
            } else {
                selectedLevel = selectedLevel.filter(l => l !== this.value);
            }
            levelsDropdownButton.textContent = selectedLevel.length > 0
                ? `Level: ${selectedLevel.length} selected`
                : "Select Course Level";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(level));
        levelsDropdownContent.appendChild(label);
    });

    // Pre-select all levels on initial load
    levelsDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        selectedLevel.push(cb.value);
    });
    levelsDropdownButton.textContent = `Level: ${selectedLevel.length} selected`;

    // ── Dropdown toggle / outside-click close ─────────────────────────────────
    categoryDropdownButton.addEventListener('click', function() {
        categoryDropdownContent.classList.toggle("show");
    });
    themesDropdownButton.addEventListener('click', function() {
        themesDropdownContent.classList.toggle("show");
    });
    levelsDropdownButton.addEventListener('click', function() {
        levelsDropdownContent.classList.toggle("show");
    });

    document.addEventListener('click', function(event) {
        if (!categoryDropdownButton.contains(event.target) && !categoryDropdownContent.contains(event.target))
            categoryDropdownContent.classList.remove("show");
    });
    document.addEventListener('click', function(event) {
        if (!themesDropdownButton.contains(event.target) && !themesDropdownContent.contains(event.target))
            themesDropdownContent.classList.remove("show");
    });
    document.addEventListener('click', function(event) {
        if (!levelsDropdownButton.contains(event.target) && !levelsDropdownContent.contains(event.target))
            levelsDropdownContent.classList.remove("show");
    });

    document.getElementById("standaloneToggle").addEventListener('click', function() {
        showStandalone = !showStandalone;
        this.textContent = showStandalone ? "Hide Standalone Courses" : "Show Standalone Courses";
        this.classList.toggle("active", showStandalone);
        updateGraph(selectedCategories, selectedThemes, selectedLevel);
    });

    // ── Graph setup ───────────────────────────────────────────────────────────
    var g = new dagreD3.graphlib.Graph().setGraph({
        rankdir: 'TB',
        nodesep: 30,
        edgesep: 0,
        ranksep: 200
    });

    // Render full course map on initial load (all levels pre-selected)
    updateGraph(selectedCategories, selectedThemes, selectedLevel);

    function renderGraph(filteredCourseIds) {
        d3.select("#initialMessage").style("display", "none");

        g.nodes().forEach(function(v) {
            var node = g.node(v);
            node.rx = node.ry = 100;
        });

        var inner = svg.append("g");
        var zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", function(event) {
                inner.attr("transform", event.transform);
                const slider = document.getElementById("zoomSlider");
                const display = document.getElementById("zoomValue");
                if (slider) slider.value = event.transform.k;
                if (display) display.textContent = Math.round(event.transform.k * 100) + '%';
            });
        svg.call(zoom);
        _zoom = zoom;

        var render = new dagreD3.render();
        render(inner, g);
        adjustSVGSize();

        var initialScale = 0.35;
        var graphWidth  = g.graph().width  || 0;
        var graphHeight = g.graph().height || 0;

        var svgBounds = svg.node().getBoundingClientRect();
        var svgWidth  = svgBounds.width;
        var svgHeight = svgBounds.height;

        if (graphWidth > 0 && graphHeight >0) {
            var translateX = (svgWidth - graphWidth * initialScale) / 2;
            var translateY = (svgHeight - graphHeight * initialScale) / 2;
            svg.call(zoom.transform, d3.zoomIdentity
                .translate(translateX, translateY)
                .scale(initialScale)
            );
        } else {
            svg.call(zoom.transform, d3.zoomIdentity.scale(initialScale));
        }

        inner.selectAll("g.node").on("click", function(_event, d) {
            const course = coursesData.find(c => c.course_code === d);
            if (!course) return;
            tooltip.transition().duration(10).style("opacity", 0);
            if (frozenCourseId === d) {
                frozenCourseId = null;
                resetHighlight();
                clearCourseInfoSidebar();
            } else {
                frozenCourseId = d;
                applyHighlight(d);
                showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds);
            }
        });

        inner.selectAll("g.node").select("rect")
            .style("fill", function(d) {
                return filteredCourseIds.includes(d) ? "#EEDFCC" : null;
            });

        var tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        var styleTooltip = function(name, description) {
            return "<p class='name'>" + name + "</p><p class='description'>" + description + "</p>";
        };

        const downstreamMap = buildDownstreamMap(coursesData);

        inner.selectAll("g.node").on("mouseover", function(_event, d) {
            if (frozenCourseId !== null) return;
            const course = coursesData.find(c => c.course_code === d);
            tooltip.transition().duration(10).style("opacity", 1);
            tooltip.html(`
                <div class="title">${course.course_code}</div>
                <div class="body">${styleTooltip(course['course title'], course.description)}</div>
            `);
            applyHighlight(d);
        })
        .on("mousemove", function(event) {
            if (frozenCourseId !== null) return;
            const tooltipWidth  = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;
            const x = event.clientX + 10;
            const y = event.clientY + 10;
            const xPos = x + tooltipWidth  > window.innerWidth  ? x - tooltipWidth  - 20 : x;
            const yPos = y + tooltipHeight > window.innerHeight ? y - tooltipHeight - 20 : y;
            tooltip.style("left", xPos + "px").style("top", yPos + "px");
        });

        inner.selectAll("g.node").on("mouseout", function() {
            if (frozenCourseId !== null) return;
            tooltip.transition().duration(10).style("opacity", 0);
            resetHighlight();
        });

        function applyHighlight(d) {
            inner.select(`g.node[id="${d}"]`).select("rect").style("fill", filteredCourseIds.includes(d) ? "#EEDFCC" : "cyan");
            inner.select(`g.node[id="${d}"]`).select("text").style("font-weight", "bold");
            inner.select(`g.node[id="${d}"]`).style("opacity", 1);

            inner.selectAll("g.node").filter(n => n !== d).style("opacity", 0.2);
            inner.selectAll("g.edgePath").style("opacity", 0.2);

            collectUpstreamEdges(d, coursesData).forEach(function({ from, to, type }) {
                const nodeColor = type === 'corequisite' ? 'coral' : 'cyan';
                inner.select(`g.node[id="${from}"]`).select("rect").style("fill", nodeColor);
                inner.select(`g.node[id="${from}"]`).select("text").style("font-weight", "bold");
                inner.select(`g.node[id="${from}"]`).style("opacity", 1);
                inner.select(`g.edgePath[id*="${from}-${to}"]`).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "3px")
                    .style("stroke", type === 'corequisite' ? 'coral' : 'black')
                    .style("stroke-dasharray", type === 'corequisite' ? "5, 5" : null);
            });

            collectDownstreamEdges(d, downstreamMap).forEach(function({ from, to, type }) {
                inner.select(`g.node[id="${to}"]`).select("rect").style("fill", "#90EE90");
                inner.select(`g.node[id="${to}"]`).select("text").style("font-weight", "bold");
                inner.select(`g.node[id="${to}"]`).style("opacity", 1);
                inner.select(`g.edgePath[id*="${from}-${to}"]`).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "3px")
                    .style("stroke", "#228B22")
                    .style("stroke-dasharray", type === 'corequisite' ? "5, 5" : null);
            });
        }

        function resetHighlight() {
            inner.selectAll("g.node").each(function(nodeId) {
                d3.select(this).select("rect").style("fill", filteredCourseIds.includes(nodeId) ? "#EEDFCC" : null);
                d3.select(this).select("text").style("font-weight", null);
                d3.select(this).style("opacity", 1);
            });
            inner.selectAll("g.edgePath").each(function() {
                const svgId = d3.select(this).attr("id") || "";
                const isCoreq = [...coreqEdgeIds].some(edgeId => svgId.includes(edgeId));
                d3.select(this).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "1.5px")
                    .style("stroke", isCoreq ? "coral" : "black")
                    .style("stroke-dasharray", isCoreq ? "5, 5" : null);
            });
        }

        _unfreezeSelection = function() {
            if (frozenCourseId !== null) {
                frozenCourseId = null;
                resetHighlight();
                clearCourseInfoSidebar();
            }
        };

        _selectCourse = function(courseCode) {
            const course = coursesData.find(c => c.course_code === courseCode);
            if (!course) return;
            frozenCourseId = courseCode;
            applyHighlight(courseCode);
            showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds);
        };
    }

    function updateGraph(selectedCategories, selectedThemes, selectedLevel) {
        selectedCategories = ensureArray(selectedCategories);
        selectedThemes     = ensureArray(selectedThemes);
        selectedLevel      = ensureArray(selectedLevel);

        clearGraph();

        if (areFiltersEmpty(selectedCategories, selectedThemes, selectedLevel)) {
            showInitialMessage();
            return;
        }

        const filteredCourses = filterCourses(selectedCategories, selectedThemes, selectedLevel);
        buildGraph(filteredCourses);
        renderGraph(filteredCourses.map(course => course.course_code));
    }

    function ensureArray(input) {
        return Array.isArray(input) ? input : [];
    }

    function clearGraph() {
        g.nodes().forEach(node => g.removeNode(node));
        g.edges().forEach(edge => g.removeEdge(edge.v, edge.w));
        coreqEdgeIds.clear();
        d3.select("svg g").remove();
        frozenCourseId = null;
        _selectCourse  = null;
        _zoom          = null;
        clearCourseInfoSidebar();
    }

    function areFiltersEmpty(categories, themes, level) {
        return categories.length === 0 && themes.length === 0 && level.length === 0;
    }

    function filterCourses(categories, themes, level) {
        return coursesData.filter(course =>
            (showStandalone || !standaloneSet.has(course.course_code)) &&
            (categories.length === 0 || categories.some(cat => course.category.includes(cat))) &&
            (themes.length    === 0 || themes.some(theme => course.theme.includes(theme))) &&
            (level.length     === 0 || level.includes(`${course.level * 100} level`))
        );
    }

    function buildGraph(courses) {
        const addedNodes = new Set();

        courses.forEach(course => {
            addNodeIfNotExists(course.course_code, addedNodes);

            course.prerequisites.forEach(prereq => {
                addNodeIfNotExists(prereq, addedNodes);
                addEdge(prereq, course.course_code, 'prerequisite');
            });

            course.corequisites.forEach(coreq => {
                addNodeIfNotExists(coreq, addedNodes);
                addEdge(coreq, course.course_code, 'corequisite');
            });
        });
    }

    function addNodeIfNotExists(nodeId, addedNodes) {
        if (!addedNodes.has(nodeId)) {
            g.setNode(nodeId, { label: nodeId, id: nodeId });
            addedNodes.add(nodeId);
        }
    }

    function addEdge(source, target, type) {
        if (type === 'corequisite') coreqEdgeIds.add(`${source}-${target}`);

        const edgeStyle = type === 'corequisite'
            ? { style: "stroke: coral; stroke-dasharray: 5, 5;", arrowheadStyle: "fill: coral" }
            : { arrowheadStyle: "fill: #000" };

        g.setEdge(source, target, {
            label: "",
            id: `${source}-${target}`,
            curve: d3.curveBasis,
            ...edgeStyle
        });
    }

    function buildDownstreamMap(courses) {
        const map = {};
        courses.forEach(course => {
            course.prerequisites.forEach(prereq => {
                if (!map[prereq]) map[prereq] = [];
                map[prereq].push({ code: course.course_code, type: 'prerequisite' });
            });
            course.corequisites.forEach(coreq => {
                if (!map[coreq]) map[coreq] = [];
                map[coreq].push({ code: course.course_code, type: 'corequisite' });
            });
        });
        return map;
    }

    function collectUpstreamEdges(courseCode, courses, visited = new Set()) {
        if (visited.has(courseCode)) return [];
        visited.add(courseCode);
        const course = courses.find(c => c.course_code === courseCode);
        if (!course) return [];
        const edges = [];
        course.prerequisites.forEach(prereq => {
            edges.push({ from: prereq, to: courseCode, type: 'prerequisite' });
            collectUpstreamEdges(prereq, courses, visited).forEach(e => edges.push(e));
        });
        course.corequisites.forEach(coreq => {
            edges.push({ from: coreq, to: courseCode, type: 'corequisite' });
            collectUpstreamEdges(coreq, courses, visited).forEach(e => edges.push(e));
        });
        return edges;
    }

    function collectDownstreamEdges(courseCode, downstreamMap, visited = new Set()) {
        if (visited.has(courseCode)) return [];
        visited.add(courseCode);
        const edges = [];
        (downstreamMap[courseCode] || []).forEach(({ code, type }) => {
            edges.push({ from: courseCode, to: code, type });
            collectDownstreamEdges(code, downstreamMap, visited).forEach(e => edges.push(e));
        });
        return edges;
    }

    // ── Sidebar course info panel ─────────────────────────────────────────────
    function showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds) {
        const panel = document.getElementById("course-info-placeholder");

        const id          = course.course_code || "Not available";
        const name        = course['course title'] || "Not available";
        const description = course.description || "Not available";
        const credits     = course.credits != null ? course.credits : "Not available";
        const category    = Array.isArray(course.category) ? course.category.join(', ') : (course.category || "Not available");
        const term        = Array.isArray(course.term)     ? course.term.join(', ')     : (course.term     || "Not available");
        const level       = course.level != null ? `${course.level * 100} level` : "Not available";
        const components  = Array.isArray(course.components) ? course.components.join(', ') : (course.components || "Not available");
        const calendarUrl = course.calendar_url || "";

        const prereqList = course.prerequisites || [];
        const coreqList  = course.corequisites  || [];
        const depList    = (downstreamMap[id]   || []).map(d => d.code);

        const isFiltered = filteredCourseIds && filteredCourseIds.includes(id);
        const headerBg   = isFiltered ? '#f9f2ea' : '#e3f8f9';

        function buildCards(codeList, cardClass) {
            if (!codeList.length) return '<p class="ci-empty">None listed.</p>';
            return codeList.map(code => {
                const rel     = coursesData.find(c => c.course_code === code);
                const relName = rel ? (rel['course title'] || '') : '';
                return `<button class="ci-course-card ${cardClass}" data-course-code="${code}">
                    <div class="ci-card-code">${code}</div>
                    ${relName ? `<div class="ci-card-name">${relName}</div>` : ''}
                </button>`;
            }).join('');
        }

        const calendarLink = calendarUrl
            ? `<span class="ci-key">Calendar</span><span class="ci-val"><a href="${calendarUrl}" target="_blank" rel="noopener">View ↗</a></span>`
            : '';

        panel.classList.add("filled");
        panel.innerHTML = `
            <div class="ci-header" style="background:${headerBg}">
                <div class="ci-header-content">
                    <div class="ci-code">${id}</div>
                    <div class="ci-name">${name}</div>
                </div>
                <button class="ci-close" id="course-info-close" title="Clear selection">✕</button>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Course Details</div>
                <div class="ci-kv-grid">
                    <span class="ci-key">Level</span><span class="ci-val">${level}</span>
                    <span class="ci-key">Credits</span><span class="ci-val">${credits}</span>
                    <span class="ci-key">Term</span><span class="ci-val">${term}</span>
                    <span class="ci-key">Category</span><span class="ci-val">${category}</span>
                    <span class="ci-key">Components</span><span class="ci-val">${components}</span>
                    ${calendarLink}
                </div>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Description</div>
                <div class="ci-description">${description}</div>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Prerequisites (${prereqList.length})</div>
                ${buildCards(prereqList, 'ci-card-prereq')}
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Corequisites (${coreqList.length})</div>
                ${buildCards(coreqList, 'ci-card-coreq')}
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Dependent Courses (${depList.length})</div>
                ${buildCards(depList, 'ci-card-dep')}
            </div>
        `;

        document.getElementById("course-info-close").addEventListener("click", function() {
            if (_unfreezeSelection) _unfreezeSelection();
        });

        panel.querySelectorAll('.ci-course-card[data-course-code]').forEach(btn => {
            btn.addEventListener('click', function() {
                if (_selectCourse) _selectCourse(this.dataset.courseCode);
            });
        });
    }

    function clearCourseInfoSidebar() {
        const panel = document.getElementById("course-info-placeholder");
        panel.classList.remove("filled");
        panel.textContent = "Click a course to view details.";
    }

    // ── Keyword search ────────────────────────────────────────────────────────
    function filterCoursesByKeywords(keywords) {
        if (!keywords) return [];
        const keywordArray = keywords.split(',').map(k => k.trim().toLowerCase());
        return coursesData.filter(course =>
            keywordArray.some(keyword => course.description.toLowerCase().includes(keyword))
        );
    }

    document.getElementById("searchButton").addEventListener('click', function() {
        const keywords = document.getElementById("keywordInput").value.trim();
        if (!keywords) return;

        const filteredCourses = filterCoursesByKeywords(keywords);

        g.nodes().forEach(node => g.removeNode(node));
        g.edges().forEach(edge => g.removeEdge(edge.v, edge.w));

        filteredCourses.forEach(function(course) {
            g.setNode(course.course_code, { label: course.course_code, id: course.course_code });
        });

        filteredCourses.forEach(function(course) {
            course.prerequisites.forEach(function(prereq) {
                if (filteredCourses.some(c => c.course_code === prereq)) {
                    g.setEdge(prereq, course.course_code, { label: "", curve: d3.curveBasis, arrowheadStyle: "fill: #000" });
                }
            });
            course.corequisites.forEach(function(coreq) {
                if (filteredCourses.some(c => c.course_code === coreq)) {
                    g.setEdge(coreq, course.course_code, { label: "", style: "stroke: coral; stroke-dasharray: 5, 5;", curve: d3.curveBasis, arrowheadStyle: "fill: coral" });
                }
            });
        });

        d3.select("svg g").remove();
        renderGraph(filteredCourses.map(c => c.course_code));
    });

    function showInitialMessage() {
        const svg = d3.select("svg");
        const initialMessage = svg.select("#initialMessage");
        if (initialMessage.empty()) {
            svg.append("text")
                .attr("id", "initialMessage")
                .attr("x", "50%")
                .attr("y", "50%")
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .style("font-size", "60px")
                .style("fill", "#8B8378")
                .style("pointer-events", "none")
                .style("font-family", "Arial, sans-serif")
                .style("font-weight", "bold")
                .style("filter", "url(#text-shadow)")
                .text("Filter Courses from the sidebar");
        } else {
            initialMessage.style("display", "block");
        }
    }

    // ── Reset button ──────────────────────────────────────────────────────────
    document.getElementById("resetButton").addEventListener('click', function() {
        selectedCategories = [];
        selectedThemes     = [];
        selectedLevel      = [];
        showStandalone     = false;

        categoryDropdownButton.textContent = "Select Category";
        themesDropdownButton.textContent   = "Select Theme";

        categoryDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        themesDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

        // Re-select all levels (reset to default all-levels state)
        levelsDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            selectedLevel.push(cb.value);
        });
        levelsDropdownButton.textContent = `Level: ${selectedLevel.length} selected`;

        const standaloneToggle = document.getElementById("standaloneToggle");
        standaloneToggle.textContent = "Show Standalone Courses";
        standaloneToggle.classList.remove("active");

        document.getElementById("keywordInput").value = "";
        document.getElementById("dialog").style.display = "none";

        updateGraph(selectedCategories, selectedThemes, selectedLevel);
    });

    document.getElementById("close-dialog").onclick = function() {
        document.getElementById("dialog").style.display = "none";
    };

    // ── Zoom slider ───────────────────────────────────────────────────────────
    document.getElementById("zoomSlider").addEventListener("input", function() {
        if (!_zoom) return;
        const k = +this.value;
        const current = d3.zoomTransform(svg.node());
        svg.call(_zoom.transform, d3.zoomIdentity.translate(current.x, current.y).scale(k));
    });

}).catch(error => console.error('Error loading the JSON:', error));
