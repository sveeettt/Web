const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const store = require('./store');

function setupRestApi(app) {
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    
    app.use(express.static(path.join(__dirname, 'public')));
    
    app.get('/', (req, res) => {
        res.render('index', { title: 'Взлёт - Национальная авиакомпания' });
    });
    
    app.get('/flights', async (req, res) => {
        try {
            // Получение параметров запроса для пагинации, сортировки и поиска
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const sortBy = req.query.sortBy || 'id';
            const sortOrder = req.query.sortOrder || 'asc';
            const search = req.query.search || '';
            
            // Получение отфильтрованных и отсортированных данных с пагинацией
            const result = await store.getFlights({
                page,
                limit,
                sortBy,
                sortOrder,
                search
            });
            
            // Формирование структуры данных для пагинации
            const pagination = {
                currentPage: result.currentPage,
                totalPages: result.totalPages,
                totalFlights: result.totalFlights,
                perPage: result.perPage,
                hasPrev: result.currentPage > 1,
                hasNext: result.currentPage < result.totalPages
            };
            
            res.render('flights', { 
                title: 'Рейсы Взлёт', 
                flights: result.flights,
                pagination: pagination,
                sortBy: sortBy,
                sortOrder: sortOrder,
                search: search,
                query: req.query
            });
        } catch (error) {
            res.status(500).render('error', { 
                title: 'Ошибка', 
                message: 'Не удалось загрузить рейсы' 
            });
        }
    });
    
    app.get('/flights/new', (req, res) => {
        res.render('flight-form', { 
            title: 'Добавить новый рейс', 
            flight: {}, 
            action: '/api/flights',
            method: 'POST' 
        });
    });
    
    app.get('/flights/edit/:id', async (req, res) => {
        try {
            const flight = await store.getFlightById(req.params.id);
            
            if (!flight) {
                return res.status(404).render('error', { 
                    title: 'Ошибка', 
                    message: 'Рейс не найден' 
                });
            }
            
            res.render('flight-form', { 
                title: 'Редактировать рейс', 
                flight: flight, 
                action: `/api/flights/${req.params.id}`, 
                method: 'PUT'
            });
        } catch (error) {
            res.status(500).render('error', { 
                title: 'Ошибка', 
                message: 'Не удалось загрузить данные рейса' 
            });
        }
    });
    
    // API для получения рейсов с пагинацией, сортировкой и поиском
    app.get('/api/flights', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const sortBy = req.query.sortBy || 'id';
            const sortOrder = req.query.sortOrder || 'asc';
            const search = req.query.search || '';
            
            const result = await store.getFlights({
                page,
                limit,
                sortBy,
                sortOrder,
                search
            });
            
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: 'Не удалось получить список рейсов' });
        }
    });
    
    app.get('/api/flights/:id', async (req, res) => {
        try {
            const flight = await store.getFlightById(req.params.id);
            
            if (!flight) {
                return res.status(404).json({ error: 'Рейс не найден' });
            }
            
            res.json(flight);
        } catch (error) {
            res.status(500).json({ error: 'Не удалось получить данные рейса' });
        }
    });
    
    app.post('/api/flights', async (req, res) => {
        try {
            const newFlight = {
                id: req.body.id,
                departure: req.body.departure,
                destination: req.body.destination,
                departureTime: req.body.departureTime,
                arrivalTime: req.body.arrivalTime,
                aircraft: req.body.aircraft,
                status: req.body.status,
                price: parseFloat(req.body.price)
            };
            
            const flight = await store.addFlight(newFlight);
            
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                res.redirect('/flights');
            } else {
                res.status(201).json(flight);
            }
        } catch (error) {
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                res.status(400).render('error', { 
                    title: 'Ошибка', 
                    message: error.message || 'Не удалось добавить рейс' 
                });
            } else {
                res.status(400).json({ error: error.message || 'Не удалось добавить рейс' });
            }
        }
    });
    
    app.put('/api/flights/:id', async (req, res) => {
        try {
            const updatedFlight = {
                departure: req.body.departure,
                destination: req.body.destination,
                departureTime: req.body.departureTime,
                arrivalTime: req.body.arrivalTime,
                aircraft: req.body.aircraft,
                status: req.body.status,
                price: parseFloat(req.body.price)
            };
            
            const flight = await store.updateFlight(req.params.id, updatedFlight);
            
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                res.redirect('/flights');
            } else {
                res.json(flight);
            }
        } catch (error) {
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                res.status(400).render('error', { 
                    title: 'Ошибка', 
                    message: error.message || 'Не удалось обновить рейс' 
                });
            } else {
                res.status(400).json({ error: error.message || 'Не удалось обновить рейс' });
            }
        }
    });
    
    app.post('/api/flights/:id', async (req, res) => {
        if (req.body._method === 'PUT') {
            try {
                const updatedFlight = {
                    departure: req.body.departure,
                    destination: req.body.destination,
                    departureTime: req.body.departureTime,
                    arrivalTime: req.body.arrivalTime,
                    aircraft: req.body.aircraft,
                    status: req.body.status,
                    price: parseFloat(req.body.price)
                };
                
                await store.updateFlight(req.params.id, updatedFlight);
                res.redirect('/flights');
            } catch (error) {
                res.status(400).render('error', { 
                    title: 'Ошибка', 
                    message: error.message || 'Не удалось обновить рейс' 
                });
            }
        } else {
            res.status(405).send('Метод не разрешен');
        }
    });
    
    app.delete('/api/flights/:id', async (req, res) => {
        try {
            await store.deleteFlight(req.params.id);
            
            if (!req.headers.accept || !req.headers.accept.includes('text/html')) {
                return res.status(204).end();
            }
            
            res.redirect('/flights');
        } catch (error) {
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                res.status(400).render('error', { 
                    title: 'Ошибка', 
                    message: error.message || 'Не удалось удалить рейс' 
                });
            } else {
                res.status(400).json({ error: error.message || 'Не удалось удалить рейс' });
            }
        }
    });
    
    app.post('/api/flights/:id/delete', async (req, res) => {
        try {
            await store.deleteFlight(req.params.id);
            res.redirect('/flights');
        } catch (error) {
            res.status(400).render('error', { 
                title: 'Ошибка', 
                message: error.message || 'Не удалось удалить рейс' 
            });
        }
    });
    app.get('/chat', (req, res) => {
    res.render('chat', { title: 'Чат поддержки Взлёт' });
    });

    app.use((req, res) => {
        res.status(404).render('error', { 
            title: 'Страница не найдена', 
            message: 'Запрошенная страница не существует' 
        });
    });
 
}

module.exports = setupRestApi;