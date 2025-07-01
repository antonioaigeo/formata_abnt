import React, { useState, useEffect, useRef, useCallback } from 'react';
// Firebase imports removed

// Custom Modal Component
const CustomModal = ({ show, message, type, onConfirm, onClose }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-auto">
                <p className="text-lg font-semibold text-gray-800 mb-4">{message}</p>
                <div className="flex justify-end space-x-3">
                    {type === 'confirm' && (
                        <button
                            onClick={() => { onConfirm(false); onClose(); }}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition duration-200"
                        >
                            Cancelar
                        </button>
                    )}
                    <button
                        onClick={() => { onConfirm(true); onClose(); }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

// Main App component
const App = () => {
    // State to manage the current view: 'formatter' or 'pdf-viewer'
    const [currentView, setCurrentView] = useState('formatter');
    // State to store the reference data entered by the user
    const [referenceData, setReferenceData] = useState({
        type: 'book', // Default reference type
        author: '', // Author of the main work or chapter/image
        title: '', // Title of the main work or chapter/image
        subtitle: '',
        edition: '',
        place: '',
        publisher: '',
        year: '',
        periodicalTitle: '',
        volume: '',
        number: '',
        pages: '', // For articles
        availableAt: '', // For online sources (website, youtube, legislation)
        accessDate: '',  // For online sources (website, youtube, legislation)
        institution: '', // For TCC, Dissertation, Thesis
        courseProgram: '', // For TCC, Dissertation, Thesis
        documentType: '', // For TCC, Dissertation, Thesis (e.g., "Trabalho de Conclusão de Curso")
        pagesOrVolumes: '', // For TCC, Dissertation, Thesis (e.g., "120 f." or "2 v.")
        videoDuration: '', // For YouTube videos
        platformProducer: '', // For YouTube videos (e.g., "YouTube", "Produtora do vídeo")
        // Fields for Legislation
        jurisdiction: '',
        legislationType: '',
        legislationNumber: '',
        legislationDate: '',
        ementa: '',
        publicationVehicle: '',
        publicationLocation: '',
        publicationVolumeNumber: '',
        publicationPages: '',
        publicationDate: '',
        // New fields for Chapter in a Book (Parte de Monografia)
        bookAuthor: '', // Author(s) of the main book
        bookTitle: '', // Title of the main book
        bookSubtitle: '',
        bookEdition: '',
        bookPlace: '',
        bookPublisher: '',
        bookYear: '',
        chapterPages: '', // Pages of the chapter within the book (e.g., p. 15-24)
        bookOrganizer: '', // Organizer of the main book, if applicable
        // New fields for Image/Photo (Documento Iconográfico)
        imageType: '', // e.g., fotografia, gravura, pintura, ilustração
        imageDimensions: '', // e.g., 46x63 cm
        imageLocation: '', // e.g., Coleção particular, Museu Nacional
    });
    // State to store the formatted ABNT reference
    const [formattedReference, setFormattedReference] = useState('');
    // State to store the formatted ABNT citation
    const [formattedCitation, setFormattedCitation] = useState('');
    // State to store the list of saved references (now non-persistent)
    const [savedReferences, setSavedReferences] = useState([]);
    // State to manage the PDF file object
    const [pdfFile, setPdfFile] = useState(null);
    // State to store the URL of the PDF for display
    const [pdfUrl, setPdfUrl] = useState('');
    // Ref for the PDF canvas
    const pdfCanvasRef = useRef(null);
    // State for PDF loading status (only for rendering now)
    const [pdfLoading, setPdfLoading] = useState(false);
    // State for PDF error messages
    const [pdfError, setPdfError] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMessage, setModalMessage] = useState('');
    const [modalType, setModalType] = useState('alert'); // 'alert' or 'confirm'
    const [modalOnConfirm, setModalOnConfirm] = useState(() => () => {}); // Callback for confirm

    // Helper function to show custom alert modal
    const showAlert = useCallback((message) => {
        setModalMessage(message);
        setModalType('alert');
        setShowModal(true);
    }, []);

    // Helper function to show custom confirm modal
    const showConfirm = useCallback((message, onConfirmCallback) => {
        setModalMessage(message);
        setModalType('confirm');
        setModalOnConfirm(() => onConfirmCallback); // Store the callback
        setShowModal(true);
    }, []);

    // Firebase initialization and related states removed

    // Function to handle changes in the input fields
    const handleChange = (e) => {
        const { name, value } = e.target;
        setReferenceData(prevData => ({
            ...prevData,
            [name]: value
        }));
    };

    // Function to format the ABNT reference and citation
    const formatABNTReference = useCallback(() => {
        const {
            type, author, title, subtitle, edition, place, publisher, year,
            periodicalTitle, volume, number, pages, availableAt, accessDate,
            institution, courseProgram, documentType, pagesOrVolumes,
            videoDuration, platformProducer,
            // Legislation fields
            jurisdiction, legislationType, legislationNumber, legislationDate, ementa,
            publicationVehicle, publicationLocation, publicationVolumeNumber, publicationPages, publicationDate,
            // Chapter fields
            bookAuthor, bookTitle, bookSubtitle, bookEdition, bookPlace, bookPublisher, bookYear, chapterPages, bookOrganizer,
            // Image fields
            imageType, imageDimensions, imageLocation
        } = referenceData;

        let ref = '';
        let citation = '';
        let authorsArray = author.split(';').map(a => a.trim()).filter(a => a); // Handle multiple authors

        // Helper to format author names for reference (LASTNAME, Firstname)
        const formatReferenceAuthor = (authorName) => {
            const parts = authorName.split(' ').filter(p => p);
            if (parts.length > 0) {
                const lastName = parts[parts.length - 1].toUpperCase();
                const firstName = parts.slice(0, parts.length - 1).join(' ');
                return `${lastName}, ${firstName}`;
            }
            return '';
        };

        // Helper to format citation authors (Surname) - ABNT NBR 10520:2023 (Sobrenome em maiúsculas e minúsculas)
        const formatCitationAuthor = (authorName) => {
            const parts = authorName.split(' ').filter(p => p);
            if (parts.length > 0) {
                const lastName = parts[parts.length - 1]; // Keep original case for surname in citation
                return `${lastName}`;
            }
            return '';
        };

        // Determine citation author(s) based on ABNT NBR 10520:2023
        let citationAuthors = '';
        if (authorsArray.length > 0) {
            if (authorsArray.length === 1) {
                citationAuthors = formatCitationAuthor(authorsArray[0]);
            } else if (authorsArray.length <= 3) {
                // For 2 or 3 authors, list all surnames separated by semicolon
                citationAuthors = authorsArray.map(formatCitationAuthor).join('; ');
            } else {
                // For more than 3 authors, use first author's surname followed by "et al."
                citationAuthors = `${formatCitationAuthor(authorsArray[0])} et al.`;
            }
        } else if (type === 'website' || type === 'youtube' || type === 'image') {
            // For online sources or images without author, use the first word of the title for citation
            citationAuthors = title.split(' ')[0]; // Keep original case for title in citation
        } else if (type === 'legislation') {
            // For legislation, citation is usually (JURISDIÇÃO, ANO)
            citationAuthors = jurisdiction;
        } else if (type === 'chapter' && bookAuthor) {
            // For chapter, use the main book author for citation if chapter author is not primary for citation
            const bookAuthorsArray = bookAuthor.split(';').map(a => a.trim()).filter(a => a);
            if (bookAuthorsArray.length > 0) {
                if (bookAuthorsArray.length === 1) {
                    citationAuthors = formatCitationAuthor(bookAuthorsArray[0]);
                } else if (bookAuthorsArray.length <= 3) {
                    citationAuthors = bookAuthorsArray.map(formatCitationAuthor).join('; ');
                } else {
                    citationAuthors = `${formatCitationAuthor(bookAuthorsArray[0])} et al.`;
                }
            } else {
                citationAuthors = bookTitle.split(' ')[0];
            }
        }


        // ABNT Formatting Logic for Reference (NBR 6023:2018)
        switch (type) {
            case 'book':
                // ABNT NBR 6023:2018 - Livros
                // SOBRENOME, Nome do autor. Título: subtítulo. Edição. Local de publicação: Editora, ano.
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                }
                ref += `<span class="font-bold">${title.toUpperCase()}</span>`;
                if (subtitle) {
                    ref += `: ${subtitle}.`;
                } else {
                    ref += '.';
                }
                if (edition) {
                    ref += ` ${edition}. ed.`;
                }
                if (place) {
                    ref += ` ${place}:`;
                }
                if (publisher) {
                    ref += ` ${publisher},`;
                }
                if (year) {
                    ref += ` ${year}.`;
                }
                break;

            case 'article':
                // ABNT NBR 6023:2018 - Artigos de periódicos
                // SOBRENOME, Nome do autor. Título do artigo. Título do periódico, local, volume, número, páginas, ano.
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                }
                ref += `${title}. `;
                if (periodicalTitle) {
                    ref += `<span class="font-bold">${periodicalTitle.toUpperCase()}</span>, `;
                }
                if (place) {
                    ref += `${place}, `;
                }
                if (volume) {
                    ref += `v. ${volume}, `;
                }
                if (number) {
                    ref += `n. ${number}, `;
                }
                if (pages) {
                    ref += `p. ${pages}, `;
                }
                if (year) {
                    ref += `${year}.`;
                }
                break;

            case 'website':
                // ABNT NBR 6023:2018 - Documentos online
                // AUTOR. Título. Ano. Disponível em: URL. Acesso em: dia mês. ano.
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                }
                ref += `<span class="font-bold">${title.toUpperCase()}</span>. `;
                if (year) {
                    ref += `${year}. `;
                }
                if (availableAt) {
                    ref += `Disponível em: ${availableAt}. `;
                }
                if (accessDate) {
                    ref += `Acesso em: ${accessDate}.`;
                }
                break;

            case 'tcc':
            case 'dissertation':
            case 'thesis':
                // ABNT NBR 6023:2018 - Trabalhos acadêmicos (TCC, Dissertação, Tese)
                // SOBRENOME, Nome do autor. Título: subtítulo. Ano. Número de folhas ou volumes f. ou v. Tipo do trabalho (grau e área de concentração) – Instituição, Local, ano.
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                }
                ref += `<span class="font-bold">${title.toUpperCase()}</span>`;
                if (subtitle) {
                    ref += `: ${subtitle}.`;
                } else {
                    ref += '.';
                }
                if (year) {
                    ref += ` ${year}.`;
                }
                if (pagesOrVolumes) {
                    ref += ` ${pagesOrVolumes}.`;
                }
                if (documentType) {
                    ref += ` ${documentType}`;
                    if (courseProgram) {
                        ref += ` (${courseProgram})`;
                    }
                    ref += ' –';
                }
                if (institution) {
                    ref += ` ${institution},`;
                }
                if (place) {
                    ref += ` ${place},`;
                }
                if (year) {
                    ref += ` ${year}.`;
                }
                break;

            case 'youtube':
                // ABNT NBR 6023:2018 - Mídias eletrônicas (adaptado para vídeo online)
                // AUTOR (ou NOME DO CANAL). Título do vídeo [Vídeo online]. Local: Produtora (se houver), ano. Duração. Disponível em: URL. Acesso em: dia mês. ano.
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                } else if (platformProducer) { // Use channel name if no author
                    ref += `${platformProducer.toUpperCase()}. `;
                }
                ref += `<span class="font-bold">${title.toUpperCase()}</span> [Vídeo online]. `;
                if (place) {
                    ref += `${place}: `;
                }
                if (platformProducer && !authorsArray.length) { // Only add if not already used as author
                    ref += `${platformProducer}, `;
                }
                if (year) {
                    ref += `${year}. `;
                }
                if (videoDuration) {
                    ref += `${videoDuration}. `;
                }
                if (availableAt) {
                    ref += `Disponível em: ${availableAt}. `;
                }
                if (accessDate) {
                    ref += `Acesso em: ${accessDate}.`;
                }
                break;

            case 'legislation':
                // ABNT NBR 6023:2018 - Legislação (7.11.1)
                // JURISDIÇÃO. [Epígrafe (Tipo de ato e número, data)]. Ementa. Dados da publicação.
                if (jurisdiction) {
                    ref += `${jurisdiction.toUpperCase()}. `;
                }
                if (legislationType && legislationNumber && legislationDate) {
                    ref += `[${legislationType} ${legislationNumber}, de ${legislationDate}]. `;
                } else if (legislationType && legislationNumber) {
                    ref += `[${legislationType} ${legislationNumber}]. `;
                } else if (legislationType) {
                    ref += `[${legislationType}]. `;
                }
                if (ementa) {
                    ref += `${ementa}. `;
                }
                if (publicationVehicle) {
                    ref += `${publicationVehicle}: `;
                }
                if (publicationLocation) {
                    ref += `${publicationLocation}, `;
                }
                if (publicationVolumeNumber) {
                    ref += `${publicationVolumeNumber}, `;
                }
                if (publicationPages) {
                    ref += `p. ${publicationPages}, `;
                }
                if (publicationDate) {
                    ref += `${publicationDate}.`;
                }
                if (availableAt) {
                    ref += ` Disponível em: ${availableAt}.`;
                }
                if (accessDate) {
                    ref += ` Acesso em: ${accessDate}.`;
                }
                break;

            case 'chapter':
                // ABNT NBR 6023:2018 - Parte de monografia (7.3)
                // AUTOR DA PARTE. Título da parte: subtítulo. In: AUTOR DA MONOGRAFIA. Título da monografia: subtítulo. Edição. Local: Editora, ano. páginas da parte.
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                }
                ref += `${title}. `;
                if (subtitle) {
                    ref += `: ${subtitle}. `;
                }
                ref += `In: `;

                const bookAuthorsArray = bookAuthor.split(';').map(a => a.trim()).filter(a => a);
                if (bookAuthorsArray.length > 0) {
                    ref += bookAuthorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                } else if (bookOrganizer) {
                    ref += `${bookOrganizer.toUpperCase()} (org.). `;
                }

                ref += `<span class="font-bold">${bookTitle.toUpperCase()}</span>`;
                if (bookSubtitle) {
                    ref += `: ${bookSubtitle}.`;
                } else {
                    ref += '.';
                }
                if (bookEdition) {
                    ref += ` ${bookEdition}. ed.`;
                }
                if (bookPlace) {
                    ref += ` ${bookPlace}:`;
                }
                if (bookPublisher) {
                    ref += ` ${bookPublisher},`;
                }
                if (bookYear) {
                    ref += ` ${bookYear}.`;
                }
                if (chapterPages) {
                    ref += ` p. ${chapterPages}.`;
                }
                if (availableAt) {
                    ref += ` Disponível em: ${availableAt}.`;
                }
                if (accessDate) {
                    ref += ` Acesso em: ${accessDate}.`;
                }
                break;

            case 'image':
                // ABNT NBR 6023:2018 - Documento iconográfico (7.15)
                // AUTOR. Título [ou Denominação]. Data. Especificação do suporte. Dimensões. (Notas)
                if (authorsArray.length > 0) {
                    ref += authorsArray.map(formatReferenceAuthor).join('; ') + '. ';
                }
                if (title) {
                    ref += `<span class="font-bold">${title.toUpperCase()}</span>. `;
                } else {
                    ref += `<span class="font-bold">[SEM TÍTULO]</span>. `;
                }
                if (year) {
                    ref += `${year}. `;
                }
                if (imageType) {
                    ref += `${imageType}. `;
                }
                if (imageDimensions) {
                    ref += `${imageDimensions}. `;
                }
                if (imageLocation) {
                    ref += `${imageLocation}.`;
                }
                if (availableAt) {
                    ref += `Disponível em: ${availableAt}.`;
                }
                if (accessDate) {
                    ref += ` Acesso em: ${accessDate}.`;
                }
                break;

            default:
                ref = 'Selecione um tipo de referência e preencha os campos.';
                break;
        }

        // Generate citation (ABNT NBR 10520:2023)
        // For legislation, citation is (JURISDIÇÃO, ANO) or (JURISDIÇÃO, ANO, p. X)
        if (type === 'legislation' && jurisdiction && (year || publicationDate)) {
            const citationYear = year || (publicationDate ? publicationDate.substring(publicationDate.lastIndexOf(' ') + 1) : '');
            citation = `(${jurisdiction}, ${citationYear})`;
        } else if (citationAuthors && year) {
            citation = `(${citationAuthors}, ${year})`;
        } else if (citationAuthors) {
            citation = `(${citationAuthors})`;
        } else if (type === 'chapter' && bookYear) { // For chapter, use book year for citation
            citation = `(${citationAuthors}, ${bookYear})`;
        } else {
            citation = 'Preencha os campos para gerar a citação.';
        }


        setFormattedReference(ref);
        setFormattedCitation(citation);
    }, [referenceData]); // Dependency array for useCallback

    // Effect to format the reference whenever referenceData changes
    useEffect(() => {
        formatABNTReference();
    }, [referenceData, formatABNTReference]);

    // Function to handle PDF file selection
    const handlePdfFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            setPdfFile(file);
            setPdfUrl(URL.createObjectURL(file));
            setPdfError('');
        } else {
            setPdfFile(null);
            setPdfUrl('');
            setPdfError('Por favor, selecione um arquivo PDF válido.');
            showAlert('Por favor, selecione um arquivo PDF válido.');
        }
    };

    // Effect to load and render PDF when pdfUrl changes
    useEffect(() => {
        if (pdfUrl) {
            setPdfLoading(true);
            // Load pdf.js library dynamically
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js';
            script.onload = () => {
                // Set worker source for pdf.js
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
                    renderPdf();
                }
            };
            script.onerror = () => {
                setPdfLoading(false);
                setPdfError('Erro ao carregar a biblioteca PDF.js.');
                showAlert('Erro ao carregar a biblioteca PDF.js. Tente recarregar a página.');
            };
            document.body.appendChild(script);

            return () => {
                // Clean up URL object when component unmounts or pdfUrl changes
                if (pdfUrl) {
                    URL.revokeObjectURL(pdfUrl);
                }
            };
        }
    }, [pdfUrl, showAlert]);

    // Function to render the PDF on the canvas
    const renderPdf = async () => {
        if (!pdfFile || !pdfCanvasRef.current || !window.pdfjsLib) return;

        try {
            const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1); // Render the first page

            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = pdfCanvasRef.current;
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport,
            };
            await page.render(renderContext).promise;
            setPdfLoading(false);
        } catch (error) {
            console.error('Error rendering PDF:', error);
            setPdfError('Erro ao renderizar o PDF. O arquivo pode estar corrompido ou não é um PDF válido.');
            showAlert('Erro ao renderizar o PDF. O arquivo pode estar corrompido ou não é um PDF válido.');
            setPdfLoading(false);
        }
    };

    // Function to save the current formatted reference and citation to the state (non-persistent)
    const handleSaveReference = () => {
        if (formattedReference && formattedCitation) {
            setSavedReferences(prevReferences => [
                ...prevReferences,
                {
                    // No need for 'id' or 'createdAt' as it's not going to Firestore
                    reference: formattedReference,
                    citation: formattedCitation,
                    data: { ...referenceData } // Save a copy of the raw data too
                }
            ]);
            showAlert("Referência salva na lista (não persistente)!");
            // Optionally clear the form after saving
            setReferenceData({
                type: 'book',
                author: '', title: '', subtitle: '', edition: '', place: '', publisher: '', year: '',
                periodicalTitle: '', volume: '', number: '', pages: '', availableAt: '', accessDate: '',
                institution: '', courseProgram: '', documentType: '', pagesOrVolumes: '',
                videoDuration: '', platformProducer: '',
                jurisdiction: '', legislationType: '', legislationNumber: '', legislationDate: '', ementa: '',
                publicationVehicle: '', publicationLocation: '', publicationVolumeNumber: '', publicationPages: '', publicationDate: '',
                bookAuthor: '', bookTitle: '', bookSubtitle: '', bookEdition: '', bookPlace: '', bookPublisher: '', bookYear: '', chapterPages: '', bookOrganizer: '',
                imageType: '', imageDimensions: '', imageLocation: '',
            });
        } else {
            showAlert("Por favor, preencha os campos para gerar uma referência antes de salvar.");
        }
    };

    // Function to download the saved references as a text file
    const handleDownloadReferences = () => {
        if (savedReferences.length === 0) {
            showAlert("Não há referências salvas para baixar.");
            return;
        }

        let content = "Referências Bibliográficas (ABNT NBR 6023:2018)\n\n";
        savedReferences.forEach((item, index) => {
            // Remove HTML tags for plain text download
            content += `${index + 1}. ${item.reference.replace(/<[^>]*>?/gm, '')}\n`;
            content += `   Citação: ${item.citation}\n\n`;
        });

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'referencias_abnt.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); // Clean up the URL object
    };

    // Function to clear all saved references from the state (non-persistent)
    const handleClearReferences = () => {
        showConfirm("Tem certeza que deseja limpar todas as referências salvas? Esta ação é irreversível e os dados serão perdidos.", (confirmed) => {
            if (confirmed) {
                setSavedReferences([]);
                showAlert("Todas as referências foram limpas da lista.");
            }
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-inter text-gray-800">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                }
                .input-field {
                    @apply w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 ease-in-out;
                }
                .label {
                    @apply block text-sm font-medium text-gray-700 mb-1;
                }
                .btn {
                    @apply px-6 py-3 rounded-lg font-semibold shadow-md transition duration-300 ease-in-out transform hover:scale-105;
                }
                .btn-primary {
                    @apply bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
                }
                .btn-secondary {
                    @apply bg-gray-200 text-gray-800 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2;
                }
                .btn-danger {
                    @apply bg-red-500 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2;
                }
                `}
            </style>

            <header className="text-center mb-8">
                <h1 className="text-4xl font-extrabold text-blue-800 mb-2">Formatador ABNT e Visualizador de PDF</h1>
                <p className="text-lg text-gray-600">Formate suas referências bibliográficas e visualize PDFs com facilidade.</p>
            </header>

            <nav className="flex justify-center space-x-4 mb-8">
                <button
                    onClick={() => setCurrentView('formatter')}
                    className={`btn ${currentView === 'formatter' ? 'btn-primary' : 'btn-secondary'}`}
                >
                    Formatador de Referências
                </button>
                <button
                    onClick={() => setCurrentView('pdf-viewer')}
                    className={`btn ${currentView === 'pdf-viewer' ? 'btn-primary' : 'btn-secondary'}`}
                >
                    Visualizador de PDF
                </button>
            </nav>

            {/* Reference Form Section */}
            {currentView === 'formatter' && (
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto mb-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Dados da Referência</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label htmlFor="type" className="label">Tipo de Referência:</label>
                            <select
                                id="type"
                                name="type"
                                value={referenceData.type}
                                onChange={handleChange}
                                className="input-field"
                            >
                                <option value="book">Livro</option>
                                <option value="article">Artigo de Periódico</option>
                                <option value="website">Site / Documento Online</option>
                                <option value="tcc">TCC (Trabalho de Conclusão de Curso)</option>
                                <option value="dissertation">Dissertação</option>
                                <option value="thesis">Tese</option>
                                <option value="youtube">Vídeo do YouTube</option>
                                <option value="legislation">Legislação</option>
                                <option value="chapter">Capítulo de Livro</option>
                                <option value="image">Imagem / Foto</option>
                            </select>
                        </div>
                        {/* Author is common to almost all types, except legislation where jurisdiction is primary */}
                        {(referenceData.type !== 'legislation' && referenceData.type !== 'chapter' && referenceData.type !== 'image') && (
                            <div>
                                <label htmlFor="author" className="label">Autor(es) (Sobrenome, Nome; separe por ponto e vírgula para múltiplos. Para entidades/canais, use o nome completo):</label>
                                <input
                                    type="text"
                                    id="author"
                                    name="author"
                                    value={referenceData.author}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: Silva, João; Santos, Maria ou Organização Mundial da Saúde"
                                />
                            </div>
                        )}
                         {/* Author for Chapter and Image */}
                         {(referenceData.type === 'chapter' || referenceData.type === 'image') && (
                            <div>
                                <label htmlFor="author" className="label">Autor(es) (do Capítulo/Imagem - Sobrenome, Nome; separe por ponto e vírgula):</label>
                                <input
                                    type="text"
                                    id="author"
                                    name="author"
                                    value={referenceData.author}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: Autor do Capítulo ou Fotógrafo"
                                />
                            </div>
                        )}
                        {/* Title is common to all types, except legislation where it's part of the epigraph */}
                        {(referenceData.type !== 'legislation' && referenceData.type !== 'chapter' && referenceData.type !== 'image') && (
                            <div>
                                <label htmlFor="title" className="label">Título:</label>
                                <input
                                    type="text"
                                    id="title"
                                    name="title"
                                    value={referenceData.title}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Título principal da obra"
                                />
                            </div>
                        )}
                        {/* Title for Chapter and Image */}
                        {(referenceData.type === 'chapter' || referenceData.type === 'image') && (
                            <div>
                                <label htmlFor="title" className="label">Título (do Capítulo/Imagem):</label>
                                <input
                                    type="text"
                                    id="title"
                                    name="title"
                                    value={referenceData.title}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: Título do Capítulo ou da Imagem"
                                />
                            </div>
                        )}

                        {/* Subtitle for Book, TCC, Dissertation, Thesis, Chapter */}
                        {(referenceData.type === 'book' || referenceData.type === 'tcc' || referenceData.type === 'dissertation' || referenceData.type === 'thesis' || referenceData.type === 'chapter') && (
                            <div>
                                <label htmlFor="subtitle" className="label">Subtítulo (da Obra/Capítulo):</label>
                                <input
                                    type="text"
                                    id="subtitle"
                                    name="subtitle"
                                    value={referenceData.subtitle}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Subtítulo (se houver)"
                                />
                            </div>
                        )}
                        {/* Edition for Book */}
                        {referenceData.type === 'book' && (
                            <div>
                                <label htmlFor="edition" className="label">Edição:</label>
                                <input
                                    type="text"
                                    id="edition"
                                    name="edition"
                                    value={referenceData.edition}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: 2. ed."
                                />
                            </div>
                        )}
                        {/* Place for Book, Article, TCC, Dissertation, Thesis, YouTube, Chapter */}
                        {(referenceData.type === 'book' || referenceData.type === 'article' || referenceData.type === 'tcc' || referenceData.type === 'dissertation' || referenceData.type === 'thesis' || referenceData.type === 'youtube' || referenceData.type === 'chapter') && (
                            <div>
                                <label htmlFor="place" className="label">Local de Publicação/Apresentação:</label>
                                <input
                                    type="text"
                                    id="place"
                                    name="place"
                                    value={referenceData.place}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: São Paulo"
                                />
                            </div>
                        )}
                        {/* Publisher for Book */}
                        {referenceData.type === 'book' && (
                            <div>
                                <label htmlFor="publisher" className="label">Editora:</label>
                                <input
                                    type="text"
                                    id="publisher"
                                    name="publisher"
                                    value={referenceData.publisher}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: Editora XYZ"
                                />
                            </div>
                        )}
                        {/* Periodical Title, Volume, Number, Pages for Article */}
                        {referenceData.type === 'article' && (
                            <>
                                <div>
                                    <label htmlFor="periodicalTitle" className="label">Título do Periódico:</label>
                                    <input
                                        type="text"
                                        id="periodicalTitle"
                                        name="periodicalTitle"
                                        value={referenceData.periodicalTitle}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Nome da revista ou periódico"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="volume" className="label">Volume:</label>
                                    <input
                                        type="text"
                                        id="volume"
                                        name="volume"
                                        value={referenceData.volume}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 10"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="number" className="label">Número:</label>
                                    <input
                                        type="text"
                                        id="number"
                                        name="number"
                                        value={referenceData.number}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 2"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="pages" className="label">Páginas (Inicial-Final):</label>
                                    <input
                                        type="text"
                                        id="pages"
                                        name="pages"
                                        value={referenceData.pages}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 25-40"
                                    />
                                </div>
                            </>
                        )}
                        {/* Institution, Course/Program, Document Type, Pages/Volumes for TCC, Dissertation, Thesis */}
                        {(referenceData.type === 'tcc' || referenceData.type === 'dissertation' || referenceData.type === 'thesis') && (
                            <>
                                <div>
                                    <label htmlFor="documentType" className="label">Tipo do Trabalho:</label>
                                    <select
                                        id="documentType"
                                        name="documentType"
                                        value={referenceData.documentType}
                                        onChange={handleChange}
                                        className="input-field"
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="Trabalho de Conclusão de Curso">Trabalho de Conclusão de Curso</option>
                                        <option value="Dissertação">Dissertação</option>
                                        <option value="Tese">Tese</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="courseProgram" className="label">Curso/Programa (Grau e Área de Concentração):</label>
                                    <input
                                        type="text"
                                        id="courseProgram"
                                        name="courseProgram"
                                        value={referenceData.courseProgram}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Graduação em Marketing"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="institution" className="label">Instituição:</label>
                                    <input
                                        type="text"
                                        id="institution"
                                        name="institution"
                                        value={referenceData.institution}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Universidade Federal de Minas Gerais"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="pagesOrVolumes" className="label">Número de Folhas ou Volumes:</label>
                                    <input
                                        type="text"
                                        id="pagesOrVolumes"
                                        name="pagesOrVolumes"
                                        value={referenceData.pagesOrVolumes}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 120 f. ou 2 v."
                                    />
                                </div>
                            </>
                        )}
                        {/* Video Duration, Platform/Producer for YouTube */}
                        {referenceData.type === 'youtube' && (
                            <>
                                <div>
                                    <label htmlFor="videoDuration" className="label">Duração do Vídeo:</label>
                                    <input
                                        type="text"
                                        id="videoDuration"
                                        name="videoDuration"
                                        value={referenceData.videoDuration}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 15 min. ou 01:20:00"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="platformProducer" className="label">Plataforma/Produtora (Nome do Canal):</label>
                                    <input
                                        type="text"
                                        id="platformProducer"
                                        name="platformProducer"
                                        value={referenceData.platformProducer}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Descomplica"
                                    />
                                </div>
                            </>
                        )}
                        {/* Legislation Fields */}
                        {referenceData.type === 'legislation' && (
                            <>
                                <div>
                                    <label htmlFor="jurisdiction" className="label">Jurisdição (Ex: BRASIL, SÃO PAULO (Estado)):</label>
                                    <input
                                        type="text"
                                        id="jurisdiction"
                                        name="jurisdiction"
                                        value={referenceData.jurisdiction}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: BRASIL ou SÃO PAULO (Estado)"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="legislationType" className="label">Tipo de Ato (Ex: Lei, Decreto, Emenda Constitucional):</label>
                                    <input
                                        type="text"
                                        id="legislationType"
                                        name="legislationType"
                                        value={referenceData.legislationType}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Lei"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="legislationNumber" className="label">Número do Ato (Ex: nº 10.406):</label>
                                    <input
                                        type="text"
                                        id="legislationNumber"
                                        name="legislationNumber"
                                        value={referenceData.legislationNumber}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: nº 10.406"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="legislationDate" className="label">Data do Ato (Ex: 10 de janeiro de 2002):</label>
                                    <input
                                        type="text"
                                        id="legislationDate"
                                        name="legislationDate"
                                        value={referenceData.legislationDate}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 10 de janeiro de 2002"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="ementa" className="label">Ementa (Resumo do Ato):</label>
                                    <textarea
                                        id="ementa"
                                        name="ementa"
                                        value={referenceData.ementa}
                                        onChange={handleChange}
                                        className="input-field h-24 resize-y"
                                        placeholder="Ex: Institui o Código Civil."
                                    ></textarea>
                                </div>
                                <div>
                                    <label htmlFor="publicationVehicle" className="label">Veículo de Publicação (Ex: Diário Oficial da União):</label>
                                    <input
                                        type="text"
                                        id="publicationVehicle"
                                        name="publicationVehicle"
                                        value={referenceData.publicationVehicle}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Diário Oficial da União"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="publicationLocation" className="label">Local de Publicação (Ex: Brasília, DF):</label>
                                    <input
                                        type="text"
                                        id="publicationLocation"
                                        name="publicationLocation"
                                        value={referenceData.publicationLocation}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Brasília, DF"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="publicationVolumeNumber" className="label">Volume/Número da Publicação (Ex: ano 139, n. 8):</label>
                                    <input
                                        type="text"
                                        id="publicationVolumeNumber"
                                        name="publicationVolumeNumber"
                                        value={referenceData.publicationVolumeNumber}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: ano 139, n. 8"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="publicationPages" className="label">Páginas na Publicação (Ex: 1-74):</label>
                                    <input
                                        type="text"
                                        id="publicationPages"
                                        name="publicationPages"
                                        value={referenceData.publicationPages}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 1-74"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="publicationDate" className="label">Data da Publicação (Ex: 11 jan. 2002):</label>
                                    <input
                                        type="text"
                                        id="publicationDate"
                                        name="publicationDate"
                                        value={referenceData.publicationDate}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 11 jan. 2002"
                                    />
                                </div>
                            </>
                        )}
                        {/* Chapter in a Book Fields */}
                        {referenceData.type === 'chapter' && (
                            <>
                                <div>
                                    <label htmlFor="bookAuthor" className="label">Autor(es) do Livro Principal (Sobrenome, Nome; separe por ponto e vírgula):</label>
                                    <input
                                        type="text"
                                        id="bookAuthor"
                                        name="bookAuthor"
                                        value={referenceData.bookAuthor}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Livro: Silva, Pedro; Santos, Ana"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookOrganizer" className="label">Organizador do Livro Principal (se houver):</label>
                                    <input
                                        type="text"
                                        id="bookOrganizer"
                                        name="bookOrganizer"
                                        value={referenceData.bookOrganizer}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Organizador: Oliveira, Carlos"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookTitle" className="label">Título do Livro Principal:</label>
                                    <input
                                        type="text"
                                        id="bookTitle"
                                        name="bookTitle"
                                        value={referenceData.bookTitle}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Título do Livro"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookSubtitle" className="label">Subtítulo do Livro Principal:</label>
                                    <input
                                        type="text"
                                        id="bookSubtitle"
                                        name="bookSubtitle"
                                        value={referenceData.bookSubtitle}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Subtítulo do Livro"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookEdition" className="label">Edição do Livro Principal:</label>
                                    <input
                                        type="text"
                                        id="bookEdition"
                                        name="bookEdition"
                                        value={referenceData.bookEdition}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 3. ed."
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookPlace" className="label">Local de Publicação do Livro Principal:</label>
                                    <input
                                        type="text"
                                        id="bookPlace"
                                        name="bookPlace"
                                        value={referenceData.bookPlace}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Rio de Janeiro"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookPublisher" className="label">Editora do Livro Principal:</label>
                                    <input
                                        type="text"
                                        id="bookPublisher"
                                        name="bookPublisher"
                                        value={referenceData.bookPublisher}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Editora ABC"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bookYear" className="label">Ano de Publicação do Livro Principal:</label>
                                    <input
                                        type="text"
                                        id="bookYear"
                                        name="bookYear"
                                        value={referenceData.bookYear}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 2020"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="chapterPages" className="label">Páginas do Capítulo (Ex: 15-24):</label>
                                    <input
                                        type="text"
                                        id="chapterPages"
                                        name="chapterPages"
                                        value={referenceData.chapterPages}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: p. 15-24"
                                    />
                                </div>
                            </>
                        )}
                        {/* Image/Photo Fields */}
                        {referenceData.type === 'image' && (
                            <>
                                <div>
                                    <label htmlFor="imageType" className="label">Tipo de Imagem (Ex: fotografia, gravura, pintura):</label>
                                    <input
                                        type="text"
                                        id="imageType"
                                        name="imageType"
                                        value={referenceData.imageType}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: fotografia"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="imageDimensions" className="label">Dimensões (Ex: 46x63 cm):</label>
                                    <input
                                        type="text"
                                        id="imageDimensions"
                                        name="imageDimensions"
                                        value={referenceData.imageDimensions}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 46x63 cm"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="imageLocation" className="label">Localização (Ex: Coleção particular, Museu Nacional):</label>
                                    <input
                                        type="text"
                                        id="imageLocation"
                                        name="imageLocation"
                                        value={referenceData.imageLocation}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: Coleção particular"
                                    />
                                </div>
                            </>
                        )}
                        {/* Available At (URL) and Access Date for Website, YouTube, Legislation, Chapter, Image (if online) */}
                        {(referenceData.type === 'website' || referenceData.type === 'youtube' || referenceData.type === 'legislation' || referenceData.type === 'chapter' || referenceData.type === 'image') && (
                            <>
                                <div>
                                    <label htmlFor="availableAt" className="label">Disponível em (URL):</label>
                                    <input
                                        type="url"
                                        id="availableAt"
                                        name="availableAt"
                                        value={referenceData.availableAt}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: https://www.exemplo.com.br"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="accessDate" className="label">Acesso em (dia mês. ano):</label>
                                    <input
                                        type="text"
                                        id="accessDate"
                                        name="accessDate"
                                        value={referenceData.accessDate}
                                        onChange={handleChange}
                                        className="input-field"
                                        placeholder="Ex: 10 jan. 2023"
                                    />
                                </div>
                            </>
                        )}
                        {/* Year is common to almost all types, except legislation and chapter (uses bookYear) */}
                        {(referenceData.type !== 'legislation' && referenceData.type !== 'chapter') && (
                            <div>
                                <label htmlFor="year" className="label">Ano de Publicação/Criação:</label>
                                <input
                                    type="text"
                                    id="year"
                                    name="year"
                                    value={referenceData.year}
                                    onChange={handleChange}
                                    className="input-field"
                                    placeholder="Ex: 2023"
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg shadow-inner">
                        <h3 className="text-xl font-bold text-blue-800 mb-4">Referência Formatada (ABNT NBR 6023:2018)</h3>
                        <p className="text-gray-900 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedReference || 'Preencha os campos acima para ver a referência formatada.' }}></p>
                    </div>

                    <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg shadow-inner">
                        <h3 className="text-xl font-bold text-green-800 mb-4">Como Citar (ABNT NBR 10520:2023)</h3>
                        <p className="text-gray-900 leading-relaxed">
                            <span className="font-semibold">Citação Direta/Indireta:</span> {formattedCitation || 'Preencha os campos para ver a citação.'}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">
                            A citação exata pode variar dependendo do contexto (citação direta, indireta, com ou sem número de página).
                            Use o formato fornecido como base.
                        </p>
                    </div>

                    <div className="mt-8 flex justify-center space-x-4">
                        <button
                            onClick={formatABNTReference} // Explicitly trigger formatting
                            className="btn btn-secondary"
                        >
                            Gerar Referência
                        </button>
                        <button
                            onClick={handleSaveReference}
                            className="btn btn-primary"
                        >
                            Salvar Referência
                        </button>
                    </div>

                    {/* Saved References List */}
                    {savedReferences.length > 0 && (
                        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg shadow-inner">
                            <h3 className="text-xl font-bold text-yellow-800 mb-4">Referências Salvas</h3>
                            <p className="text-sm text-red-700 mb-4 font-semibold">
                                **Atenção:** As referências salvas nesta lista NÃO são persistentes. Elas serão perdidas se você recarregar ou sair da página. Use o botão "Baixar Referências" para salvar seus dados.
                            </p>
                            <ul className="list-decimal list-inside space-y-4">
                                {savedReferences.map((item, index) => (
                                    <li key={index} className="text-gray-900 leading-relaxed"> {/* Changed key to index as no Firestore ID */}
                                        <p dangerouslySetInnerHTML={{ __html: item.reference }}></p>
                                        <p className="text-sm text-gray-700">Citação: {item.citation}</p>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-6 flex justify-center space-x-4">
                                <button
                                    onClick={handleDownloadReferences}
                                    className="btn btn-primary"
                                >
                                    Baixar Referências (.txt)
                                </button>
                                <button
                                    onClick={handleClearReferences}
                                    className="btn btn-danger"
                                >
                                    Limpar Lista
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PDF Viewer Section */}
            {currentView === 'pdf-viewer' && (
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto mb-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Visualizador de PDF</h2>
                    <p className="text-gray-700 mb-4">
                        Carregue um arquivo PDF para visualizá-lo e, em seguida, insira manualmente as informações no "Formatador de Referências".
                    </p>
                    <div className="mb-6">
                        <label htmlFor="pdfUpload" className="label">Carregar PDF:</label>
                        <input
                            type="file"
                            id="pdfUpload"
                            accept="application/pdf"
                            onChange={handlePdfFileChange}
                            className="input-field file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>

                    {pdfError && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                            <strong className="font-bold">Erro:</strong>
                            <span className="block sm:inline"> {pdfError}</span>
                        </div>
                    )}

                    {pdfLoading && (
                        <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-lg">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                            <p className="text-blue-600 font-medium">Carregando PDF...</p>
                        </div>
                    )}

                    {pdfUrl && !pdfLoading && !pdfError && (
                        <div className="mt-6 border border-gray-300 rounded-lg overflow-hidden shadow-md">
                            <h3 className="text-lg font-semibold bg-gray-100 p-3 border-b border-gray-200">Conteúdo do PDF (Primeira Página)</h3>
                            <div className="p-4 flex justify-center bg-gray-50">
                                <canvas ref={pdfCanvasRef} className="max-w-full h-auto border border-gray-200 rounded-md"></canvas>
                            </div>
                            <p className="p-4 text-sm text-gray-600 bg-gray-100 border-t border-gray-200">
                                <span className="font-bold">Instruções:</span> Visualize o conteúdo do PDF acima para extrair manualmente as informações (autor, título, ano, etc.) e insira-as no "Formatador de Referências" para gerar a referência ABNT correta.
                            </p>
                        </div>
                    )}
                </div>
            )}

            <footer className="text-center text-gray-500 text-sm mt-8 pb-4">
                Desenvolvido com ❤️ para ajudar na formatação ABNT.
            </footer>

            <CustomModal
                show={showModal}
                message={modalMessage}
                type={modalType}
                onConfirm={(confirmed) => {
                    if (modalType === 'confirm') {
                        modalOnConfirm(confirmed);
                    }
                    setShowModal(false);
                }}
                onClose={() => setShowModal(false)}
            />
        </div>
    );
};

export default App;
