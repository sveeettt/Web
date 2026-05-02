document.addEventListener('DOMContentLoaded', function() {
    const flightsTable = document.querySelector('.flights-table');
    if (flightsTable) {
        flightsTable.style.opacity = '0';
        setTimeout(() => {
            flightsTable.style.transition = 'opacity 0.5s ease-in-out';
            flightsTable.style.opacity = '1';
        }, 100);
    }
    
    const flightForm = document.querySelector('.flight-form');
    if (flightForm) {
        flightForm.addEventListener('submit', function(event) {
            const idInput = document.getElementById('id');
            const departureInput = document.getElementById('departure');
            const destinationInput = document.getElementById('destination');
            const priceInput = document.getElementById('price');
            
            if (idInput && !idInput.readOnly) {
                const idPattern = /^B2\d{3}$/;
                if (!idPattern.test(idInput.value)) {
                    event.preventDefault();
                    alert('Номер рейса должен соответствовать формату "B2XXX", где X - цифра.');
                    return;
                }
            }
            
            if (departureInput.value === destinationInput.value) {
                event.preventDefault();
                alert('Пункт отправления и пункт назначения не могут быть одинаковыми.');
                return;
            }
            
            if (parseFloat(priceInput.value) < 1000) {
                event.preventDefault();
                alert('Минимальная цена билета - 1000 руб.');
                return;
            }
        });
    }
});