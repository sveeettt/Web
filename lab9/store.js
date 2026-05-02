const fs = require('fs').promises;
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');

async function readData() {
    try {
        const data = await fs.readFile(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка при чтении файла:', error);
        return { flights: [] };
    }
}

async function writeData(data) {
    try {
        await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Ошибка при записи в файл:', error);
        return false;
    }
}

async function getAllFlights() {
    const data = await readData();
    return data.flights;
}

// Новый метод для получения рейсов с пагинацией, сортировкой и поиском
async function getFlights(options = {}) {
    const {
        page = 1,
        limit = 5,
        sortBy = 'id',
        sortOrder = 'asc',
        search = ''
    } = options;

    const data = await readData();
    let flights = [...data.flights];
    
    // Поиск
    if (search) {
        const searchLower = search.toLowerCase();
        flights = flights.filter(flight => {
            return (
                flight.id.toLowerCase().includes(searchLower) ||
                flight.departure.toLowerCase().includes(searchLower) ||
                flight.destination.toLowerCase().includes(searchLower)
            );
        });
    }
    
    // Сортировка
    flights.sort((a, b) => {
        let valueA = a[sortBy];
        let valueB = b[sortBy];
        
        // Для сортировки строк
        if (typeof valueA === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
        }
        
        if (sortOrder === 'asc') {
            return valueA > valueB ? 1 : -1;
        } else {
            return valueA < valueB ? 1 : -1;
        }
    });
    
    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFlights = flights.slice(startIndex, endIndex);
    
    return {
        flights: paginatedFlights,
        totalFlights: flights.length,
        totalPages: Math.ceil(flights.length / limit),
        currentPage: page,
        perPage: limit
    };
}


async function getFlightById(id) {
    const data = await readData();
    return data.flights.find(flight => flight.id === id);
}

async function addFlight(flight) {
    const data = await readData();
    
    if (data.flights.some(f => f.id === flight.id)) {
        throw new Error('Рейс с таким ID уже существует');
    }
    
    data.flights.push(flight);
    await writeData(data);
    return flight;
}

async function updateFlight(id, updatedFlight) {
    const data = await readData();
    const index = data.flights.findIndex(flight => flight.id === id);
    
    if (index === -1) {
        throw new Error('Рейс не найден');
    }
    
    updatedFlight.id = id;
    data.flights[index] = updatedFlight;
    
    await writeData(data);
    return updatedFlight;
}

async function deleteFlight(id) {
    const data = await readData();
    const index = data.flights.findIndex(flight => flight.id === id);
    
    if (index === -1) {
        throw new Error('Рейс не найден');
    }
    
    const deletedFlight = data.flights[index];
    data.flights.splice(index, 1);
    
    await writeData(data);
    return deletedFlight;
}

module.exports = {
    getAllFlights,
    getFlights,//
    getFlightById,
    addFlight,
    updateFlight,
    deleteFlight
};