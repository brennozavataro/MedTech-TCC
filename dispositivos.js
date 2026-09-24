/* ==========================================================================
   MedTech — dispositivos.js
   Define o tema salvo ANTES da renderização (evita flash), depois liga
   o botão de alternância de tema e o comportamento da navbar ao rolar.
   Este script deve ser carregado no <head>, ANTES do <link> do CSS,
   sem "defer" nem "async".
   ========================================================================== */

(function () {
    "use strict";
    try {
        var saved = localStorage.getItem("medtech-theme");
        document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
    } catch (e) {
        document.documentElement.setAttribute("data-theme", "dark");
    }
})();

document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    var STORAGE_KEY = "medtech-theme";
    var root = document.documentElement;
    var toggleBtn = document.getElementById("themeToggle");

    if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
            var current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
            var next = current === "light" ? "dark" : "light";
            root.setAttribute("data-theme", next);
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch (e) {
                /* localStorage indisponível — o tema apenas não será lembrado */
            }
        });
    }

    var menuToggle = document.getElementById("menuToggle");
    var navLinks = document.getElementById("navLinks");

    if (menuToggle && navLinks) {
        menuToggle.addEventListener("click", function () {
            var isOpen = navLinks.classList.toggle("open");
            menuToggle.classList.toggle("open", isOpen);
            menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });

        navLinks.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", function () {
                navLinks.classList.remove("open");
                menuToggle.classList.remove("open");
                menuToggle.setAttribute("aria-expanded", "false");
            });
        });

        document.addEventListener("click", function (e) {
            if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
                navLinks.classList.remove("open");
                menuToggle.classList.remove("open");
                menuToggle.setAttribute("aria-expanded", "false");
            }
        });
    }

    var navbar = document.getElementById("navbar");
    if (navbar) {
        var lastScrollTop = 0;
        window.addEventListener("scroll", function () {
            var currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            if (currentScroll > lastScrollTop && currentScroll > 80) {
                navbar.classList.add("nav-hidden");
            } else {
                navbar.classList.remove("nav-hidden");
            }
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
        });
    }
});
